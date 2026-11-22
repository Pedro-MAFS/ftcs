import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { ImapFlow, MailboxObject } from 'imapflow'
import { ImportIndex } from './conversations'
import { ReadOnlyInbox, syncFlags } from './flags'
import { append, newFolder } from './storage'

test('已读写回跨重启恢复，远端改回未读、移除、权限拒绝和 UID 换代分别处理', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-flags-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const folder = newFolder('inbox', 'INBOX')
  folder.uid_validity = 1
  folder.last_scanned_uid = 2
  let index = await ImportIndex.load(dir, () => {})
  const id = index.ensureContact({ email: 'a@example.test' })
  const record = {
    message_id: 'one',
    direction: 'incoming',
    conversation_contact_ids: [id],
    occurred_at: '2026-11-20',
    ingested_at: '2026-11-20',
  }
  index.message(record, append(path.join(dir, 'messages', '2026-11.jsonl'), record))
  const remote = new Map<number, Set<string>>()
  for (const uid of [1, 2]) {
    const copy = { uid, uid_validity: 1, rev: 1, message_id: 'one', present: true, seen: false }
    index.copy(folder.folder_id!, copy)
    append(path.join(dir, 'copies', folder.folder_id + '.jsonl'), copy)
    remote.set(uid, new Set(['\\Flagged']))
  }
  const box = { uidValidity: 1n, highestModseq: 2n, readOnly: false } as MailboxObject
  let lostReceipt = true,
    stores = 0,
    changes = 0
  const client = {
    enabled: new Set(['CONDSTORE']),
    mailboxOpen: async () => box,
    fetchAll: async (
      range: number[] | string,
      _query: unknown,
      options: { uid: boolean; changedSince?: bigint },
    ) => {
      assert.ok(options.uid)
      if (options.changedSince) changes++
      return (typeof range === 'string' ? [...remote.keys()] : range).flatMap((uid) =>
        remote.has(uid) ? [{ uid, flags: remote.get(uid) }] : [],
      )
    },
    messageFlagsAdd: async (ids: number[], flags: string[], opts: { uid: boolean }) => {
      assert.deepEqual(flags, ['\\Seen'])
      assert.ok(opts.uid)
      stores++
      ids.forEach((uid) => remote.get(uid)!.add(flags[0]))
      if (lostReceipt) throw new Error('offline')
      return true
    },
  } as unknown as ImapFlow
  const sync = () => syncFlags(client, box, folder, dir, index, () => {})
  const unread = () => index.unreadMessages(folder).size
  assert.equal(unread(), 1)
  assert.equal(index.markRead(folder, 'other', new Set(['one'])), false)
  assert.equal(index.markRead(folder, id, new Set(['one'])), true)
  assert.equal(unread(), 0)
  await assert.rejects(sync(), /offline/)
  index = await ImportIndex.load(dir, () => {})
  assert.ok(index.inboxCopies(folder).every((c) => c.pending_seen))
  lostReceipt = false
  await sync()
  assert.equal(stores, 1)
  assert.ok(index.inboxCopies(folder).every((c) => c.seen && c.pending_seen === undefined))
  assert.ok(remote.get(1)!.has('\\Flagged'))
  remote.get(2)!.delete('\\Seen')
  box.highestModseq = 3n
  await sync()
  assert.ok(changes)
  assert.equal(unread(), 1)
  box.readOnly = true
  index.markRead(folder, id, new Set(['one']))
  await assert.rejects(sync(), ReadOnlyInbox)
  assert.equal(unread(), 1)
  box.readOnly = false
  box.uidValidity = 2n
  index.markRead(folder, id, new Set(['one']))
  await assert.rejects(sync(), /标识已更新/)
  assert.equal(stores, 1)
  box.uidValidity = 1n
  remote.delete(2)
  await sync()
  assert.equal(index.inboxCopies(folder).length, 1)
  assert.equal(index.count, 1)
})

test('普通 IMAP 轮转覆盖旧 UID，失败批次保留进度与副本', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-flags-pages-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const index = await ImportIndex.load(dir, () => {})
  const folder = newFolder('inbox', 'INBOX')
  folder.uid_validity = 9
  for (let uid = 1; uid <= 205; uid++)
    index.copy(folder.folder_id!, {
      uid,
      uid_validity: 9,
      rev: 1,
      message_id: 'mail' + uid,
      seen: false,
      present: true,
    })
  let failing = false
  const client = {
    fetchAll: async (ids: number[]) => {
      if (failing) throw new Error('FETCH interrupted')
      return ids.filter((uid) => uid !== 205).map((uid) => ({ uid, flags: new Set(['\\Seen']) }))
    },
  } as unknown as ImapFlow
  const sync = () => syncFlags(client, { uidValidity: 9n } as MailboxObject, folder, dir, index, () => {})
  await sync()
  assert.equal(folder.flags_after_uid, 200)
  failing = true
  await assert.rejects(sync(), /interrupted/)
  assert.equal(index.inboxCopies(folder).length, 205)
  assert.equal(folder.flags_after_uid, 200)
  failing = false
  await sync()
  assert.equal(index.inboxCopies(folder).length, 204)
  assert.ok(index.inboxCopies(folder).every((row) => row.seen))
})
