import { randomUUID } from 'node:crypto'
import { ComposerStore } from './composer-store'
import type { QuoteSource } from './compose-types'
import { key } from './types'
import fs from 'node:fs'
import path from 'node:path'
import { describeAttachment, type StoredAttachment } from './attachments'
import { readableHtml } from './html-body'
import { splitQuotedText } from './reply-quote'
import { compile } from 'html-to-text'
import { append, eachLine, readAt, type Position } from './storage'
import type { Conversation, Folder, MailAddress, TimelineCursor, TimelinePage, MessageView } from './types'

interface ContactRow {
  contact_id: string
  address_key: string
  email: string
  display_name?: string
  company?: string
  rev: number
}
export interface MessageRow {
  quoted_message_id?: string
  reply_to?: MailAddress[]
  message_id: string
  internet_message_id?: string
  in_reply_to?: string | string[]
  references?: string[]
  import_key?: string
  direction: string
  occurred_at: string
  ingested_at: string
  subject?: string
  text_body?: string
  html_body?: string
  from?: MailAddress
  to?: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  attachments?: StoredAttachment[]
  conversation_contact_ids: string[]
}
interface CopyRow {
  uid: number
  uid_validity: number
  message_id: string
  rev: number
  present: boolean
  seen: boolean
  pending_seen?: boolean
}
interface Summary extends TimelineCursor, Position {
  outgoing: boolean
  preview: string
  subject: string
  contacts: string[]
}
const plainText = compile({
  wordwrap: false,
  selectors: ['img', 'script', 'style'].map((selector) => ({ selector, format: 'skip' })),
})
function body(row: MessageRow) {
  return row.text_body?.trim() || (row.html_body ? plainText(row.html_body) : '')
}
function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}
function compare(a: TimelineCursor, b: TimelineCursor) {
  return cmp(a.at, b.at) || cmp(a.id, b.id)
}
function lowerBound(rows: Summary[], cursor: TimelineCursor) {
  let lo = 0,
    hi = rows.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (compare(rows[mid], cursor) < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}
function quoteSource(r: MessageRow, text = body(r)): QuoteSource {
  return {
    id: r.message_id,
    subject: r.subject ?? '',
    snippet: text.slice(0, 140),
    outgoing: r.direction === 'outgoing',
    from: r.from,
    replyTo: r.reply_to ?? [],
    to: r.to ?? [],
    cc: r.cc ?? [],
    threaded: /^<[^<>\s]+>$/.test(r.internet_message_id ?? ''),
  }
}
export class ImportIndex {
  readonly composer: ComposerStore
  private constructor(private dir: string) {
    this.composer = new ComposerStore(dir, this)
  }
  hasMessage(id: string) {
    return this.positions.has(id)
  }
  hasConversation(contact: string) {
    return this.byContact.has(contact)
  }
  ensureContact(peer: MailAddress) {
    const address = key(peer.email)
    let id = this.contacts.get(address)
    if (!id) {
      id = randomUUID()
      const contact = {
        contact_id: id,
        address_key: address,
        email: peer.email,
        display_name: peer.name,
        updated_at: new Date().toISOString(),
        rev: 1,
      }
      append(path.join(this.dir, 'contacts.jsonl'), contact)
      this.contact(contact)
    }
    return id
  }
  original(id: string, contact: string) {
    const row = this.positions.get(id)
    if (!row?.contacts.includes(contact)) throw new Error('当前会话中找不到引用的原邮件。')
    const record = this.readRecord(row)
    return { record, quote: quoteSource(record) }
  }
  readonly contacts = new Map<string, string>()
  readonly messages = new Map<string, string>()
  readonly copies = new Set<string>()
  // null marks an ambiguous Internet Message-ID within this mailbox account.
  private internetIds = new Map<string, Summary | null>()
  private people = new Map<string, ContactRow>()
  private byContact = new Map<string, Summary[]>()
  private positions = new Map<string, Summary>()
  private states = new Map<string, CopyRow>()
  get count() {
    return this.positions.size
  }
  static async load(dir: string, guard: () => void) {
    const index = new ImportIndex(dir)
    const contacts = path.join(dir, 'contacts.jsonl')
    if (fs.existsSync(contacts)) await eachLine(contacts, (r) => index.contact(r), guard)
    for (const kind of ['messages', 'copies']) {
      const base = path.join(dir, kind)
      if (!fs.existsSync(base)) continue
      for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.jsonl'))) {
        guard()
        await eachLine(
          path.join(base, file),
          (r, pos) => {
            if (kind === 'messages') index.message(r, pos)
            else index.copy(file.slice(0, -6), r)
          },
          guard,
        )
      }
    }
    guard()
    await index.composer.restore(guard)
    return index
  }
  contact(r: ContactRow) {
    if ((this.people.get(r.contact_id)?.rev ?? 0) > r.rev) return
    this.people.set(r.contact_id, r)
    this.contacts.set(r.address_key, r.contact_id)
  }
  message(r: MessageRow, pos: Position) {
    if (r.import_key) this.messages.set(r.import_key, r.message_id)
    if (this.positions.has(r.message_id)) return
    const snippet =
      body(r).slice(0, 256).replace(/\s+/g, ' ').trim() ||
      r.attachments?.[0]?.filename ||
      r.subject ||
      '无正文'
    const row = {
      ...pos,
      id: r.message_id,
      at: r.occurred_at || r.ingested_at,
      outgoing: r.direction === 'outgoing',
      preview: snippet.slice(0, 120),
      subject: r.subject || '（无主题）',
      contacts: r.conversation_contact_ids,
    }
    this.positions.set(row.id, row)
    const internetId = r.internet_message_id?.trim()
    if (internetId) this.internetIds.set(internetId, this.internetIds.has(internetId) ? null : row)
    for (const contact of new Set(r.conversation_contact_ids)) {
      const list = this.byContact.get(contact) ?? []
      list.splice(lowerBound(list, row), 0, row)
      this.byContact.set(contact, list)
    }
  }
  copy(folder: string, r: CopyRow) {
    const id = folder + ':' + r.uid_validity + ':' + r.uid
    this.copies.add(id)
    if ((this.states.get(id)?.rev ?? 0) <= r.rev) this.states.set(id, r)
  }
  unreadMessages(inbox: Folder): Set<string> {
    const unread = new Set<string>(),
      prefix = inbox.folder_id + ':' + inbox.uid_validity + ':'
    for (const [id, r] of this.states)
      if (id.startsWith(prefix) && r.present && !(r.pending_seen ?? r.seen)) {
        const message = this.positions.get(r.message_id)
        if (message?.contacts.length && !message.outgoing) unread.add(message.id)
      }
    return unread
  }
  conversations(inbox: Folder): Conversation[] {
    const unread = this.unreadMessages(inbox)
    const result: Conversation[] = []
    for (const [id, list] of this.byContact) {
      const person = this.people.get(id),
        last = list.at(-1)
      if (!person || !last) continue
      result.push({
        id,
        email: person.email,
        name: person.display_name,
        company: person.company,
        lastAt: last.at,
        lastId: last.id,
        draftPreview: this.composer.preview(id),
        preview: (last.outgoing ? '我：' : '') + last.preview,
        count: list.length,
        unread: list.reduce((n, m) => n + Number(unread.has(m.id)), 0),
      })
    }
    return result.sort((a, b) => cmp(b.lastAt, a.lastAt) || cmp(b.lastId, a.lastId) || cmp(a.id, b.id))
  }
  private readRecord(row: Summary): MessageRow {
    const record = readAt<MessageRow>(row)
    if (record.message_id !== row.id) throw new Error('邮件位置已改变')
    return record
  }
  attachment(messageId: string, ordinal: number) {
    const row = this.positions.get(messageId)
    const attachment =
      row && Number.isSafeInteger(ordinal) && ordinal >= 0
        ? this.readRecord(row).attachments?.[ordinal]
        : undefined
    if (!attachment) throw new Error('此邮件中找不到这个附件。')
    return attachment
  }
  private replyTarget(row: MessageRow, contact: string) {
    if (row.quoted_message_id) {
      const parent = this.positions.get(row.quoted_message_id)
      if (parent?.contacts.includes(contact)) return { id: parent.id, contact, subject: parent.subject }
    }
    const direct = [row.in_reply_to ?? []].flat().join(' ').trim()
    const id = direct || row.references?.at(-1)?.trim()
    // Multiple parents or malformed headers do not identify one original message.
    if (!id || !/^<[^<>\s]+>$/.test(id)) return
    const parent = this.internetIds.get(id)
    if (!parent?.contacts.length || parent.id === row.message_id) return
    return {
      id: parent.id,
      subject: parent.subject,
      contact: parent.contacts.includes(contact) ? contact : parent.contacts[0],
    }
  }
  async timeline(
    contact: string,
    before: TimelineCursor | undefined,
    guard: () => void,
    aroundId?: string,
  ): Promise<TimelinePage> {
    const rows = this.byContact.get(contact)
    if (!rows) throw new Error('当前账号中没有这个会话。')
    let end = before ? lowerBound(rows, before) : rows.length
    let start = Math.max(0, end - 30)
    if (aroundId) {
      const target = this.positions.get(aroundId)
      if (!target || !target.contacts.includes(contact)) throw new Error('此会话中找不到原邮件。')
      start = lowerBound(rows, target)
      end = Math.min(rows.length, start + 30)
    }
    const selected = rows.slice(start, end)
    const readMessage = (row: Summary) => {
      const r = this.readRecord(row)
      const text = body(r)
      return {
        id: row.id,
        at: row.at,
        outgoing: row.outgoing,
        subject: r.subject || '（无主题）',
        ...(r.html_body?.trim() ? { body: text } : splitQuotedText(text)),
        quoteSource: quoteSource(r, text),
        delivery: this.composer.delivery(r.message_id, r.internet_message_id),
        replyTo: this.replyTarget(r, contact),
        html: r.html_body?.trim() ? readableHtml(r.html_body) : undefined,
        from: r.from,
        to: r.to ?? [],
        cc: r.cc ?? [],
        bcc: r.bcc ?? [],
        attachments: (r.attachments ?? []).map(describeAttachment),
      }
    }
    let messages: MessageView[]
    try {
      messages = selected.map(readMessage)
    } catch {
      for (const file of new Set(selected.map((r) => r.file))) {
        await eachLine(
          file,
          (r, pos) => {
            const stored = this.positions.get(r.message_id)
            if (stored?.file === file) Object.assign(stored, pos)
          },
          guard,
        )
      }
      guard()
      messages = selected.map(readMessage)
    }
    return { messages, before: start ? { at: rows[start].at, id: rows[start].id } : null }
  }
}
