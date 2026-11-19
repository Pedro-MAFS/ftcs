import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { simpleParser, type AddressObject } from 'mailparser'
import type { ImapFlow } from 'imapflow'
import { append, atomic, eachLine, save, uuid } from './storage'
import { key, type Account, type Folder } from './types'

export class ImportIndex {
  readonly contacts = new Map<string, string>()
  readonly messages = new Map<string, string>()
  readonly copies = new Set<string>()
  count = 0
  constructor(dir: string) {
    const contacts = path.join(dir, 'contacts.jsonl')
    if (fs.existsSync(contacts)) eachLine(contacts, (r) => this.contacts.set(r.address_key, r.contact_id))
    for (const kind of ['messages', 'copies']) {
      const base = path.join(dir, kind)
      if (!fs.existsSync(base)) continue
      for (const name of fs.readdirSync(base).filter((n) => n.endsWith('.jsonl')))
        eachLine(path.join(base, name), (r) => {
          if (kind === 'messages') {
            this.count++
            if (r.import_key) this.messages.set(r.import_key, r.message_id)
          } else this.copies.add(name.slice(0, -6) + ':' + r.uid_validity + ':' + r.uid)
        })
    }
  }
}
function addresses(value: AddressObject | AddressObject[] | undefined) {
  return [value ?? []]
    .flat()
    .flatMap((v) => v.value)
    .flatMap((a) => (a.address ? [{ email: a.address, name: a.name }] : []))
}
export async function importFolder(
  client: ImapFlow,
  dir: string,
  account: Account,
  folder: Folder,
  index: ImportIndex,
  guard: () => void,
  progress: () => void,
) {
  const folderId = folder.folder_id
  if (!folderId || !uuid(folderId) || !folder.remote_path) throw new Error('无效文件夹')
  const box = await client.mailboxOpen(folder.remote_path, { readOnly: true })
  guard()
  const file = path.join(dir, 'sync', folder.role + '.json')
  const validity = Number(box.uidValidity)
  const upper = box.uidNext - 1
  if (folder.uid_validity !== validity) {
    folder.uid_validity = validity
    folder.last_scanned_uid = 0
    folder.initial_upper_uid = upper
    folder.phase = 'backfill'
    save(file, folder)
  }
  const from = Date.parse(account.sync_from)
  const begin = folder.last_scanned_uid + 1
  if (begin <= upper) {
    const range = begin + ':' + upper
    const found = await client.search({ uid: range, since: new Date(from - 86400000) }, { uid: true })
    if (!found) throw new Error('邮件搜索失败')
    for (const uid of found.sort((a, b) => a - b)) {
      guard()
      const ref = folderId + ':' + validity + ':' + uid
      if (index.copies.has(ref)) continue
      const raw = await client.fetchOne(
        String(uid),
        { source: true, internalDate: true, flags: true },
        { uid: true },
      )
      guard()
      if (!raw) continue // Removed between SEARCH and FETCH.
      if (!raw.source || !raw.internalDate) throw new Error('邮件内容读取失败')
      const received = new Date(raw.internalDate)
      if (received.getTime() < from) continue
      const parsed = await simpleParser(raw.source, { skipHtmlToText: true, skipTextToHtml: true })
      guard()
      const isSent = folder.role === 'sent'
      const sender = addresses(parsed.from)[0]
      const to = addresses(parsed.to),
        cc = addresses(parsed.cc),
        bcc = addresses(parsed.bcc)
      const peers = isSent ? [...to, ...cc, ...bcc] : sender ? [sender] : []
      const ids = new Set<string>()
      for (const peer of peers) {
        const address = key(peer.email)
        if (address === account.address_key) continue
        let id = index.contacts.get(address)
        if (!id) {
          id = randomUUID()
          append(path.join(dir, 'contacts.jsonl'), {
            contact_id: id,
            address_key: address,
            email: peer.email,
            display_name: peer.name,
            updated_at: new Date().toISOString(),
            rev: 1,
          })
          index.contacts.set(address, id)
        }
        ids.add(id)
      }
      const hash = createHash('sha256').update(raw.source).digest('hex')
      const importKey = (parsed.messageId ?? ref) + '/' + hash
      let messageId = index.messages.get(importKey)
      if (!messageId) {
        messageId = randomUUID()
        const now = new Date().toISOString()
        const attachments = parsed.attachments.map((a) => {
          const attachment_id = randomUUID()
          atomic(path.join(dir, 'attachments', attachment_id, 'content'), a.content)
          return {
            attachment_id,
            filename: a.filename ?? '附件',
            mime_type: a.contentType,
            size_bytes: a.size,
            availability: 'local',
          }
        })
        append(path.join(dir, 'messages', now.slice(0, 7) + '.jsonl'), {
          message_id: messageId,
          internet_message_id: parsed.messageId,
          import_key: importKey,
          origin_copy: { folder_id: folderId, uid_validity: validity, uid },
          in_reply_to: parsed.inReplyTo,
          references: [parsed.references ?? []].flat(),
          direction: isSent ? 'outgoing' : 'incoming',
          from: sender,
          to,
          cc,
          bcc,
          reply_to: addresses(parsed.replyTo),
          conversation_contact_ids: [...ids],
          subject: parsed.subject ?? '',
          text_body: parsed.text,
          html_body: parsed.html || undefined,
          attachments,
          occurred_at: (parsed.date ?? received).toISOString(),
          ingested_at: now,
        })
        index.messages.set(importKey, messageId)
        index.count++
      }
      append(path.join(dir, 'copies', folderId + '.jsonl'), {
        uid_validity: validity,
        uid,
        message_id: messageId,
        seen: raw.flags?.has('\\Seen') ?? false,
        present: true,
        rev: 1,
        updated_at: new Date().toISOString(),
      })
      index.copies.add(ref)
      folder.last_scanned_uid = uid
      save(file, folder)
      progress()
    }
  }
  guard()
  folder.last_scanned_uid = upper
  folder.phase = 'incremental'
  folder.last_synced_at = new Date().toISOString()
  save(file, folder)
}
