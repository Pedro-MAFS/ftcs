import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ImportIndex } from './conversations'
import { append, newFolder } from './storage'

test('existing monthly shards: stable pagination, attribution, readable HTML and effective unread', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-mail-history-'))
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }))
  const people = path.join(dir, 'contacts.jsonl')
  for (const id of ['alice', 'bob', 'orphan'])
    append(people, { contact_id: id, email: id + '@example.test', address_key: id + '@example.test', rev: 1 })
  append(people, {
    contact_id: 'alice',
    email: 'alice@example.test',
    address_key: 'alice@example.test',
    display_name: 'Alice',
    company: 'Northwind',
    rev: 2,
  })
  const files = ['2026-10', '2026-11'].map((m) => path.join(dir, 'messages', m + '.jsonl'))
  const time = '2026-10-15T01:12:03.000Z'
  for (let i = 64; i >= 0; i--) {
    const id = String(i).padStart(2, '0')
    append(files[i % 2], {
      message_id: id,
      occurred_at: time,
      conversation_contact_ids: i === 64 ? ['alice', 'bob'] : ['alice'],
      direction: i === 64 ? 'outgoing' : 'incoming',
      cc: [{ email: 'bob@example.test' }],
      subject: '询价' + i,
      text_body: i % 2 ? '邮件正文' + i : undefined,
      html_body: '<p>第一段</p><script>alert(1)</script><img src="https://invalid.test"><p>第二段</p>',
      attachments: [{ filename: '询价单.pdf', size_bytes: 1200, attachment_id: 'private-id' }],
    })
  }
  const inbox = newFolder('inbox', 'INBOX')
  inbox.uid_validity = 8
  const copies = path.join(dir, 'copies', inbox.folder_id + '.jsonl')
  const copy = (uid: number, id: string, rev: number, extra: object = {}) =>
    append(copies, { uid, rev, message_id: id, uid_validity: 8, present: true, seen: false, ...extra })
  copy(1, '01', 1)
  copy(2, '01', 1)
  copy(3, '02', 1)
  copy(3, '02', 2, { pending_seen: true })
  copy(4, '03', 1, { uid_validity: 7 })
  copy(5, '04', 1, { present: false })
  copy(6, '64', 1)
  const index = await ImportIndex.load(dir, () => {})
  assert.equal(index.count, 65)
  const rows = index.conversations(inbox)
  assert.deepEqual(
    rows.map((r) => r.id),
    ['alice', 'bob'],
  )
  assert.equal(rows[0].company, 'Northwind')
  assert.deepEqual([...index.unreadMessages(inbox)], ['01'])
  assert.equal(rows[0].unread, 1)
  assert.equal(rows[0].count, 65)
  const ids: string[] = []
  let cursor
  for (const expected of [30, 30, 5]) {
    const page = await index.timeline('alice', cursor, () => {})
    assert.equal(page.messages.length, expected)
    ids.unshift(...page.messages.map((m) => m.id))
    cursor = page.before ?? undefined
  }
  assert.equal(cursor, undefined)
  assert.deepEqual(
    ids,
    Array.from({ length: 65 }, (_, i) => String(i).padStart(2, '0')),
  )
  const bob = await index.timeline('bob', undefined, () => {})
  assert.equal(bob.messages.length, 1)
  assert.match(bob.messages[0].html!.fragment, /<p>第一段/)
  assert.equal(bob.messages[0].html?.remoteImages, true)
  assert.match(bob.messages[0].body, /第一段\s+第二段/)
  assert.doesNotMatch(bob.messages[0].body, /alert|invalid.test/)
  assert.deepEqual(bob.messages[0].attachments, [{ filename: '询价单.pdf', size_bytes: 1200, available: false, previewable: false }])
  await assert.rejects(
    index.timeline('orphan', undefined, () => {}),
    /会话/,
  )
  // Simulate an externally reformatted shard: its records remain valid at new byte positions.
  const original = fs.readFileSync(files[0], 'utf8')
  fs.writeFileSync(files[0], ' ' + original)
  assert.equal((await index.timeline('bob', undefined, () => {})).messages[0].id, '64')
})

test('原邮件按账号内唯一标识定位，支持旧分片、跨页、跨联系人和后补导入', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-reply-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'messages', '2026-11.jsonl')
  const initial = await ImportIndex.load(dir, () => {})
  const add = (id: number, extra: object = {}) => {
    const row = {
      message_id: String(id),
      internet_message_id: '<' + id + '@example.test>',
      occurred_at: new Date(1000 * id).toISOString(),
      ingested_at: '',
      direction: 'incoming',
      conversation_contact_ids: ['alice'],
      subject: '同一主题',
      ...extra,
    }
    initial.message(row, append(file, row))
  }
  for (let i = 0; i < 70; i++) add(i)
  add(70, { in_reply_to: '<0@example.test>' })
  add(71, { references: ['<0@example.test>', '<1@example.test>'] })
  add(72, { in_reply_to: '<missing>', references: ['<0@example.test>'] })
  add(73, { in_reply_to: '<73@example.test>' })
  add(74, { in_reply_to: '<0@example.test> <1@example.test>' })
  add(75, { in_reply_to: '<duplicate>' })
  add(76, { internet_message_id: '<duplicate>' })
  add(77, { internet_message_id: '<duplicate>' })
  add(78, { in_reply_to: '<other>', text_body: '这次回复\n> 引用内容' })
  add(79, { internet_message_id: '<other>', conversation_contact_ids: ['bob'] })
  add(80)
  for (const index of [initial, await ImportIndex.load(dir, () => {})]) {
    const page = await index.timeline('alice', undefined, () => {})
    const message = (id: number) => page.messages.find((m) => m.id === String(id))!
    assert.deepEqual(message(70).replyTo, { id: '0', contact: 'alice', subject: '同一主题' })
    assert.equal(message(71).replyTo?.id, '1')
    for (const id of [72, 73, 74, 75, 80]) assert.equal(message(id).replyTo, undefined)
    assert.equal(message(78).replyTo?.contact, 'bob')
    assert.equal(message(78).body, '这次回复')
    assert.equal(message(78).quote, '> 引用内容')
    assert.ok(!page.messages.some((m) => m.id === '0'))
    const older = await index.timeline('alice', undefined, () => {}, '0')
    assert.equal(older.messages[0].id, '0')
    assert.equal(older.messages.length, 30)
    await assert.rejects(
      index.timeline('alice', undefined, () => {}, '79'),
      /找不到原邮件/,
    )
  }
})
