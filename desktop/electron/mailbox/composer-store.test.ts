import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { simpleParser } from 'mailparser'
import { importFolder } from './import'
import type { ImapFlow } from 'imapflow'
import type { Account } from './types'
import { ImportIndex, type MessageRow } from './conversations'
import { append, newFolder } from './storage'
import { envelope, type Draft, type DraftInput, type SendResult } from './compose-types'
import developerContact from '../../../website/src/config/developer-contact.json' with { type: 'json' }

const self = 'sales@atlas.test',
  email = 'alice@example.test',
  idle = () => {}
const edit: DraftInput = { mode: 'new', text_body: '报价\n第二行' }
function command(d: Draft) {
  return {
    kind: 'send' as const,
    request: randomUUID(),
    version: { draft_id: d.draft_id, rev: d.rev },
    to: d.to.map((a) => a.email),
    cc: d.cc.map((a) => a.email),
  }
}
async function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-write-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const index = await ImportIndex.load(dir, idle)
  return { dir, index, store: index.composer }
}
test('临时草稿与同名附件可恢复；只有 SMTP 接受后成为正式联系人', async (t) => {
  const { dir, index, store } = await setup(t)
  let d = store.view(email, self).draft
  assert.equal(index.contacts.size, 0)
  d = store.write(email, self, d, edit).draft
  const file = path.join(dir, '报价.txt')
  fs.writeFileSync(file, '第一版')
  d = (await store.addFile(email, self, d, file, idle)).draft
  fs.writeFileSync(file, '第二版')
  d = (await store.addFile(email, self, d, file, idle)).draft
  fs.unlinkSync(file)
  assert.deepEqual(store.temporary(), [email])
  assert.deepEqual(index.conversations(newFolder('inbox', 'INBOX')), [])
  const restored = await ImportIndex.load(dir, idle)
  const writer = restored.composer
  assert.deepEqual(writer.view(email, self).draft, JSON.parse(JSON.stringify({ v: 1, ...d })))
  d = writer.remove(email, self, d, d.attachments[0].attachment_id).draft
  const send = command(d)
  let submits = 0
  await writer.send(
    email,
    self,
    send,
    async (a, files) => {
      submits++
      assert.equal(fs.readFileSync(files[0].path, 'utf8'), '第二版')
      assert.equal(a.snapshot.subject, '报价')
      assert.equal(a.in_reply_to, undefined)
      return { state: 'accepted', accepted: [email], rejected: [] }
    },
    idle,
    idle,
  )
  const reused = await writer.send(
    email,
    self,
    send,
    async () => {
      throw new Error('重复投递')
    },
    idle,
    idle,
  )
  assert.equal(submits, 1)
  assert.equal(reused.state, 'accepted')
  assert.equal(writer.view(email, self).draft.rev, 0)
  assert.equal(restored.count, 1)
  assert.deepEqual(writer.temporary(), [])
  assert.equal((await ImportIndex.load(dir, idle)).count, 1)
})
test('预置开发者联系人：可直接写信，重开后复用联系人、备注和往来', async (t) => {
  const { dir } = await setup(t)
  const inbox = newFolder('inbox', 'INBOX')
  const index = await ImportIndex.load(dir, idle, developerContact)
  const [developer] = index.conversations(inbox)
  assert.deepEqual([developer.name, developer.email, developer.count, developer.unread, developer.lastAt],
    [developerContact.name, developerContact.email, 0, 0, undefined])
  assert.deepEqual(await index.timeline(developer.id, undefined, idle), { messages: [], before: null })
  index.setRemark(developer.id, '产品反馈')
  index.setPinned(developer.id, true)
  const writer = index.composer
  const draft = writer.write(developer.email, self, writer.view(developer.email, self).draft, edit).draft
  assert.equal(draft.contact_id, developer.id)
  assert.deepEqual(writer.temporary(), [])
  assert.equal(index.conversations(inbox)[0].draftPreview, edit.text_body)
  await writer.send(developer.email, self, command(draft), async a => {
    assert.deepEqual(a.snapshot.to, [{ email: developer.email }])
    return { state: 'accepted' }
  }, idle, idle)
  const log = path.join(dir, 'contacts.jsonl')
  const saved = fs.readFileSync(log, 'utf8')
  const reopened = await ImportIndex.load(dir, idle, developerContact)
  const rows = reopened.conversations(inbox)
  assert.equal(rows.length, 1)
  assert.deepEqual([rows[0].id, rows[0].remark, rows[0].pinned, rows[0].count], [developer.id, '产品反馈', true, 1])
  assert.equal((await reopened.timeline(developer.id, undefined, idle)).messages[0].body, edit.text_body)
  assert.equal(fs.readFileSync(log, 'utf8'), saved)
})

test('引用所选旧消息，回复全部去除本账号及重复地址，保留原信关系与本地跳转', async (t) => {
  const { dir, index, store } = await setup(t)
  const id = index.ensureContact({ email }),
    bob = { email: 'bob@example.test' }
  const row: MessageRow = {
    message_id: randomUUID(),
    direction: 'incoming',
    occurred_at: '2026-11-19',
    ingested_at: '2026-11-19',
    subject: '询价',
    from: { email },
    reply_to: [{ email: 'orders@example.test' }],
    to: [{ email: self }, bob],
    cc: [bob, { email: 'cc@example.test' }],
    bcc: [{ email: 'hidden@example.test' }],
    references: ['<prior>'],
    internet_message_id: '<old>',
    conversation_contact_ids: [id],
  }
  index.message(row, append(path.join(dir, 'messages', '2026-11.jsonl'), row))
  let d = store.view(email, self).draft
  d = store.write(email, self, d, {
    ...edit,
    quoted_message_id: row.message_id,
    mode: 'reply_all',
    new_subject_override: '另发报价',
  }).draft
  assert.deepEqual(
    d.to.map((a) => a.email),
    ['orders@example.test', bob.email],
  )
  assert.deepEqual(
    d.cc.map((a) => a.email),
    ['cc@example.test'],
  )
  assert.equal(d.subject, 'Re: 询价')
  const q = index.original(row.message_id, id).quote
  assert.equal(envelope(email, self, { ...d, mode: 'new' }).subject, '另发报价')
  assert.deepEqual(
    envelope(email, self, { ...d, mode: 'reply' }, q).to.map((a) => a.email),
    ['orders@example.test'],
  )
  const result = await store.send(
    email,
    self,
    command(d),
    async (a) => {
      assert.deepEqual(a.references, ['<prior>', '<old>'])
      assert.equal(a.in_reply_to, '<old>')
      return {
        state: 'accepted',
        accepted: ['orders@example.test'],
        rejected: [bob.email, 'cc@example.test'],
      }
    },
    idle,
    idle,
  )
  assert.equal(result.rejected?.length, 2)
  const sent = (await index.timeline(id, undefined, idle)).messages.find((m) => m.outgoing)!
  assert.equal(sent.replyTo?.id, row.message_id)
  assert.equal(sent.delivery?.rejected?.length, 2)
})
test('并发发送、回执丢失和重启恢复，经已发送副本核对后只入库一次', async (t) => {
  const { dir, store } = await setup(t)
  const d = store.write(email, self, store.view(email, self).draft, edit).draft,
    send = command(d)
  let finish!: (s: SendResult) => void,
    internetId = ''
  const pending = store.send(
    email,
    self,
    send,
    async (a) => {
      internetId = a.internet_message_id
      return new Promise<SendResult>((resolve) => {
        finish = resolve
      })
    },
    idle,
    idle,
  )
  assert.equal(
    (await store.send(email, self, command(d), async () => assert.fail(), idle, idle)).state,
    'submitting',
  )
  assert.throws(() => store.write(email, self, d, edit), /发送/)
  // On-disk log at this instant models process termination before the final SMTP response.
  const reopened = await ImportIndex.load(dir, idle)
  assert.equal(reopened.composer.view(email, self).result?.state, 'unknown')
  finish({ state: 'unknown' })
  await pending
  const parsed = await simpleParser(
    'From: ' +
      self +
      '\r\nTo: ' +
      email +
      '\r\nSubject: test\r\nMessage-ID: ' +
      internetId +
      '\r\n\r\nnot the draft',
  )
  const matched = reopened.composer.matchCopy(parsed.messageId, undefined)!
  assert.ok(matched)
  reopened.composer.confirmCopy(matched, parsed.messageId)
  reopened.composer.confirmCopy(matched, parsed.messageId)
  assert.equal(reopened.count, 1)
  assert.equal(reopened.composer.view(email, self).draft.rev, 0)
})
test('明确拒绝可重试；副本先于成功回执时保留逐地址结果', async (t) => {
  const { index, store } = await setup(t)
  const d = store.write(email, self, store.view(email, self).draft, edit).draft
  const first = command(d)
  await store.send(email, self, first, async () => ({ state: 'failed', detail: '拒收' }), idle, idle)
  assert.equal(store.view(email, self).result?.state, 'failed')
  await store.send(
    email,
    self,
    command(d),
    async (a) => {
      const parsed = await simpleParser('Message-ID: ' + a.internet_message_id + '\r\n\r\n')
      parsed.text = d.text_body
      parsed.subject = d.subject
      const matched = store.matchCopy(parsed.messageId, undefined)!
      store.confirmCopy(matched, parsed.messageId)
      assert.equal(store.view(email, self).result?.state, 'submitting')
      assert.equal(index.count, 0)
      return { state: 'accepted', accepted: [email] }
    },
    idle,
    idle,
  )
  assert.equal(index.count, 1)
})
test('已接受后写盘中断，按冻结的消息 ID 补记并保留新版本草稿', async (t) => {
  const { dir, index, store } = await setup(t)
  const d = store.write(email, self, store.view(email, self).draft, edit).draft
  assert.throws(() => store.write(email, self, { draft_id: d.draft_id, rev: 0 }, edit), /版本/)
  const persisted = fs.readFileSync(path.join(dir, 'drafts', d.contact_id + '.json'), 'utf8')
  const result = await store.send(email, self, command(d), async () => ({ state: 'accepted' }), idle, idle)
  assert.ok(result.attempt_id)
  const sent = (await index.timeline(d.contact_id, undefined, idle)).messages[0]
  const month = new Date().toISOString().slice(0, 7)
  fs.unlinkSync(path.join(dir, 'messages', month + '.jsonl'))
  fs.writeFileSync(path.join(dir, 'drafts', d.contact_id + '.json'), persisted)
  const reopened = await ImportIndex.load(dir, idle)
  assert.equal((await reopened.timeline(d.contact_id, undefined, idle)).messages[0].id, sent.id)
  assert.equal(reopened.composer.view(email, self).draft.rev, 0)
  const next = reopened.composer.write(email, self, reopened.composer.view(email, self).draft, {
    mode: 'new',
    text_body: '下一封',
  }).draft
  const again = await ImportIndex.load(dir, idle)
  assert.equal(again.count, 1)
  assert.equal(again.composer.view(email, self).draft.draft_id, next.draft_id)
})
test('引用本方发件时收件范围排除密送，新邮件保留正文首行', () => {
  const bcc = 'undisclosed@example.test'
  const source = {
    id: randomUUID(),
    outgoing: true,
    subject: 'Re: 询价',
    snippet: '',
    threaded: true,
    from: { email: self },
    replyTo: [],
    to: [{ email }, { email: self }],
    cc: [{ email }, { email: 'cc@example.test' }],
  }
  const reply = envelope(bcc, self, { mode: 'reply', text_body: '好的' }, source)
  assert.deepEqual(reply.to, [{ email: bcc }])
  const all = envelope(bcc, self, { mode: 'reply_all', text_body: '好的' }, source)
  assert.deepEqual(all.to, [{ email }])
  assert.deepEqual(all.cc, [{ email: 'cc@example.test' }])
  assert.equal(all.subject, source.subject)
  assert.deepEqual(envelope(self, self, edit).to, [{ email: self }])
})

test('旧 QQ 副本两种标识均未匹配，内容和时间相同也保留两条', async (t) => {
  const { dir, store } = await setup(t)
  const d = store.write(email, self, store.view(email, self).draft, edit).draft
  const qq = '<tencent_86D8DDA29AB15997BC016F5C90CD43858609@qq.com>'
  let localId = '',
    date = ''
  await store.send(
    email,
    self,
    command(d),
    async (a) => {
      localId = a.message_id
      date = new Date(Math.floor(Date.parse(a.created_at) / 1000) * 1000).toISOString()
      return { state: 'accepted' }
    },
    idle,
    idle,
  )
  const historical: MessageRow = {
    message_id: randomUUID(),
    internet_message_id: qq,
    import_key: qq + '/mimehash',
    origin_copy: { folder_id: randomUUID(), uid_validity: 1, uid: 199 },
    occurred_at: date,
    ingested_at: date,
    from: { email: self },
    to: [{ email }],
    cc: [],
    bcc: [],
    direction: 'outgoing',
    references: [],
    subject: d.subject,
    text_body: d.text_body,
    attachments: [],
    conversation_contact_ids: [d.contact_id],
  }
  const log = path.join(dir, 'messages', date.slice(0, 7) + '.jsonl')
  append(log, historical)
  const reply = {
    ...historical,
    message_id: randomUUID(),
    internet_message_id: '<response@example.test>',
    direction: 'incoming',
    origin_copy: undefined,
    import_key: undefined,
    in_reply_to: qq,
    from: { email },
    to: [{ email: self }],
  }
  append(log, reply)
  for (let i = 0; i < 2; i++) {
    const index = await ImportIndex.load(dir, idle)
    assert.equal(index.count, 3)
    const timeline = await index.timeline(d.contact_id, undefined, idle)
    assert.equal(timeline.messages.filter((m) => m.outgoing).length, 2)
    assert.equal(timeline.messages.find((m) => !m.outgoing)?.replyTo?.id, historical.message_id)
    assert.notEqual(index.original(historical.message_id, d.contact_id).record.message_id, localId)
  }
})
test('按两个标识同步，服务器改写标识后原位更新正文、附件、地址和回复链', async (t) => {
  const { dir, index, store } = await setup(t)
  const d = store.write(email, self, store.view(email, self).draft, edit).draft
  let local = '',
    original = '',
    marker = ''
  await store.send(
    email,
    self,
    command(d),
    async (a) => {
      local = a.message_id
      original = a.internet_message_id
      marker = a.attempt_id
      return { state: 'accepted', accepted: [email] }
    },
    idle,
    idle,
  )
  const folder = newFolder('sent', 'Sent')
  const raws: string[] = []
  const client = {
    mailboxOpen: async () => ({ uidValidity: 1, uidNext: raws.length + 1 }),
    search: async () => [raws.length],
    fetchOne: async () => ({ source: Buffer.from(raws.at(-1)!), internalDate: new Date() }),
  } as unknown as ImapFlow
  async function sync(id: string, tag: string, body = 'rewritten') {
    raws.push(
      [
        'From: sales@atlas.test',
        'To: other@example.test',
        'Bcc: hidden@example.test',
        'Subject: server subject',
        'Message-ID: ' + id,
        'X-FTCS-Send-ID: ' + tag,
        'Content-Type: multipart/mixed; boundary=ftcs',
        '',
        '--ftcs',
        'Content-Type: text/plain',
        '',
        body,
        '--ftcs',
        'Content-Disposition: attachment; filename=new.txt',
        'Content-Type: text/plain',
        '',
        'attachment',
        '--ftcs--',
        '',
      ].join('\r\n'),
    )
    await importFolder(
      client,
      dir,
      { address_key: self, sync_from: '2020-01-01' } as Account,
      folder,
      index,
      idle,
      idle,
    )
  }
  await sync(original, randomUUID())
  assert.equal(index.count, 1)
  assert.equal(index.original(local, d.contact_id).record.text_body, edit.text_body)
  const rewritten = '<server@example.test>'
  await sync(rewritten, marker)
  await sync(rewritten, 'unrelated', 'another MIME encoding')
  for (const ix of [index, await ImportIndex.load(dir, idle)]) {
    const r = ix.original(local, d.contact_id).record
    assert.equal(ix.count, 1)
    assert.equal(r.internet_message_id, rewritten)
    assert.equal(r.subject, 'server subject')
    assert.equal(r.text_body?.trim(), 'rewritten')
    assert.equal(r.attachments?.[0]?.filename, 'new.txt')
    assert.equal(r.bcc?.[0]?.email, 'hidden@example.test')
    assert.equal(r.to?.[0]?.email, 'other@example.test')
    assert.equal(ix.composer.matchCopy(original, undefined)?.message_id, local)
    assert.equal(ix.composer.matchCopy(rewritten, undefined)?.message_id, local)
    assert.deepEqual((await ix.timeline(d.contact_id, undefined, idle)).messages[0].delivery?.accepted, [
      email,
    ])
  }
  const reply = store.write(email, self, store.view(email, self).draft, {
    mode: 'reply',
    quoted_message_id: local,
    text_body: 'reply',
  }).draft
  await store.send(
    email,
    self,
    command(reply),
    async (a) => {
      assert.equal(a.in_reply_to, rewritten)
      await sync('<second-server-id@example.test>', a.attempt_id, 'copy arrived first')
      return { state: 'unknown' }
    },
    idle,
    idle,
  )
  for (const ix of [index, await ImportIndex.load(dir, idle)]) {
    const messages = (await ix.timeline(d.contact_id, undefined, idle)).messages
    assert.equal(messages.length, 2)
    const second = messages.find((m) => m.id !== local)!
    assert.equal(second.body, 'copy arrived first')
    assert.equal(second.replyTo?.id, local)
    assert.equal(second.delivery?.state, 'accepted')
  }
})

test('富文本和模板按账号保存，收起重启后仍在同一草稿，普通邮件保持纯文本', async (t) => {
  const { dir, index, store } = await setup(t)
  const other = await setup(t)
  const rich = {
    text_body: '报价\n样品',
    html_body: '<p><strong>报价</strong></p><ul><li><p>样品</p></li></ul>',
  }
  assert.deepEqual(
    store.setBodyTemplate({ ...rich, html_body: rich.html_body + '<script>bad()</script>' }),
    rich,
  )
  assert.equal(other.store.bodyTemplate(), undefined)
  const empty = store.view(email, self).draft
  assert.equal(empty.text_body, '')
  assert.equal(empty.html_body, undefined)
  const d = store.write(email, self, empty, { ...rich, mode: 'new', template_applied: true }).draft
  const reopened = await ImportIndex.load(dir, idle)
  assert.deepEqual(reopened.composer.bodyTemplate(), rich)
  assert.equal(reopened.composer.view(email, self).draft.template_applied, true)
  assert.equal(reopened.composer.view(email, self).draft.html_body, rich.html_body)
  assert.equal(store.setBodyTemplate({ text_body: '' }), undefined)
  await store.send(
    email,
    self,
    command(d),
    async (a) => {
      assert.equal(a.snapshot.text_body, rich.text_body)
      assert.equal(a.snapshot.html_body, rich.html_body)
      return { state: 'accepted' }
    },
    idle,
    idle,
  )
  const [sent] = (await index.timeline(d.contact_id, undefined, idle)).messages
  assert.equal(sent.subject, '报价')
  assert.match(sent.html!.fragment, /<strong>报价<\/strong>/)
  const next = store.write(email, self, store.view(email, self).draft, edit).draft
  assert.equal(next.html_body, undefined)
})

test('a mailbox without UIDNEXT or EXISTS is not marked synced', async (t) => {
  const { dir, index } = await setup(t)
  const folder = newFolder('inbox', 'INBOX')
  const client = { mailboxOpen: async () => ({ uidValidity: 1n }) } as unknown as ImapFlow
  await assert.rejects(
    importFolder(client, dir, { sync_from: new Date().toISOString() } as Account, folder, index, idle, idle),
    /邮件服务器未返回文件夹范围/,
  )
  assert.equal(folder.phase, 'backfill')
})

test('a NetEase mailbox without UIDNEXT imports through the UID list', async (t) => {
  const { dir, index } = await setup(t)
  const folder = newFolder('inbox', 'INBOX')
  const raw = Buffer.from('From: a@b.test\r\nTo: sales@atlas.test\r\nSubject: hi\r\nMessage-ID: <n@t>\r\n\r\nbody\r\n')
  const client = {
    mailboxOpen: async () => ({ uidValidity: 1n, exists: 1 }),
    search: async () => [7],
    fetchOne: async () => ({ source: raw, internalDate: new Date(), flags: new Set() }),
  } as unknown as ImapFlow
  await importFolder(
    client,
    dir,
    { sync_from: '2020-01-01T00:00:00.000Z', address_key: self } as Account,
    folder,
    index,
    idle,
    idle,
  )
  assert.equal(folder.phase, 'incremental')
  assert.equal(folder.last_scanned_uid, 7)
  assert.equal(index.messages.size, 1)
})
