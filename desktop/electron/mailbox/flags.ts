import path from 'node:path'
import type { ImapFlow, MailboxObject } from 'imapflow'
import type { ImportIndex } from './conversations'
import { save } from './storage'
import type { Folder } from './types'

const batchSize = 200
const seen = '\\Seen'

export class ReadOnlyInbox extends Error {
  constructor() {
    super('收件箱不允许修改已读状态，已恢复服务器上的标记。')
  }
}

// The caller owns the selected mailbox for the entire pass.
export async function syncFlags(
  client: ImapFlow,
  box: MailboxObject,
  folder: Folder,
  dir: string,
  index: ImportIndex,
  guard: () => void,
) {
  const copies = index.inboxCopies(folder).sort((a, b) => a.uid - b.uid)
  if (!copies.length) return
  const known = new Map(copies.map((c) => [c.uid, c]))
  const highest = client.enabled?.has('CONDSTORE') && !box.noModseq ? box.highestModseq : undefined
  const previous = highest && folder.flags_modseq ? BigInt(folder.flags_modseq) : undefined
  async function refresh(range: number[] | string, since?: bigint) {
    const rows = await client.fetchAll(range, { uid: true, flags: true }, { uid: true, changedSince: since })
    guard()
    const found = new Set<number>()
    for (const row of rows) {
      if (!known.has(row.uid)) continue
      if (!row.flags) throw new Error('未收到邮件标记。')
      const value = row.flags.has(seen)
      index.changeCopy(folder, row.uid, value ? { seen: true, pending_seen: undefined } : { seen: false })
      found.add(row.uid)
    }
    if (Array.isArray(range))
      for (const uid of range)
        if (!found.has(uid)) index.changeCopy(folder, uid, { present: false, pending_seen: undefined })
  }

  const uids = copies.map((c) => c.uid)
  const start = uids.findIndex((uid) => uid > (folder.flags_after_uid ?? 0))
  const batch = uids.slice(Math.max(0, start), Math.max(0, start) + batchSize)
  if (highest && (!previous || highest < previous)) {
    for (let i = 0; i < uids.length; i += batchSize) await refresh(uids.slice(i, i + batchSize))
  } else {
    if (previous && highest && highest > previous) await refresh('1:' + folder.last_scanned_uid, previous)
    await refresh(batch)
  }
  guard()
  folder.flags_modseq = highest?.toString()
  folder.flags_after_uid = batch[batch.length - 1]
  save(path.join(dir, 'sync', 'inbox.json'), folder)

  const pending = () =>
    index
      .inboxCopies(folder)
      .filter((c) => c.pending_seen === true && known.has(c.uid))
      .map((c) => c.uid)
  const ids = pending()
  if (!ids.length) return
  function denied(rejected = pending()) {
    for (const uid of rejected) index.changeCopy(folder, uid, { pending_seen: undefined })
    throw new ReadOnlyInbox()
  }
  guard()
  const writable = await client.mailboxOpen(folder.remote_path!, { readOnly: false }).catch((e) => {
    guard()
    if (e?.serverResponseCode === 'NOPERM') denied()
    throw e
  })
  guard()
  if (Number(writable.uidValidity) !== folder.uid_validity) throw new Error('收件箱标识已更新。')
  const allowed = writable.permanentFlags
  if (writable.readOnly || (allowed && !allowed.has(seen) && !allowed.has('\\*'))) denied()
  for (let i = 0; i < ids.length; i += batchSize) {
    const part = ids.slice(i, i + batchSize)
    await refresh(part)
    const waiting = new Set(pending())
    const targets = part.filter((uid) => waiting.has(uid))
    if (!targets.length) continue
    let ok: boolean
    try {
      ok = await client.messageFlagsAdd(targets, [seen], { uid: true })
    } catch (e) {
      guard()
      if ((e as { serverResponseCode?: string }).serverResponseCode === 'NOPERM') denied()
      throw e
    }
    guard()
    // ImapFlow also returns false for some transport/command failures. Re-read FLAGS before resolving.
    if (!ok && !client.usable) throw new Error('写回期间连接中断。')
    await refresh(targets)
    const unconfirmed = new Set(pending())
    const remaining = targets.filter((uid) => unconfirmed.has(uid))
    if (remaining.length && !ok) denied(remaining)
    if (remaining.length) throw new Error('服务器尚未确认已读标记。')
  }
}
