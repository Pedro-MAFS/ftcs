import fs from 'node:fs'
import path from 'node:path'
import { readableHtml } from './html-body'
import { splitQuotedText } from './reply-quote'
import { compile } from 'html-to-text'
import { eachLine, type Position } from './storage'
import type { Conversation, Folder, MailAddress, TimelineCursor, TimelinePage, MessageView } from './types'

interface ContactRow {
  contact_id: string
  address_key: string
  email: string
  display_name?: string
  company?: string
  rev: number
}
interface MessageRow {
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
  attachments?: MessageView['attachments']
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
export class ImportIndex {
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
    const index = new ImportIndex()
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
  conversations(inbox: Folder): Conversation[] {
    const unread = new Set<string>(),
      prefix = inbox.folder_id + ':' + inbox.uid_validity + ':'
    for (const [id, r] of this.states)
      if (id.startsWith(prefix) && r.present && !(r.pending_seen ?? r.seen)) unread.add(r.message_id)
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
        preview: (last.outgoing ? '我：' : '') + last.preview,
        count: list.length,
        unread: list.reduce((n, m) => n + Number(!m.outgoing && unread.has(m.id)), 0),
      })
    }
    return result.sort((a, b) => cmp(b.lastAt, a.lastAt) || cmp(b.lastId, a.lastId) || cmp(a.id, b.id))
  }
  private replyTarget(row: MessageRow, contact: string) {
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
      const fd = fs.openSync(row.file, 'r')
      try {
        const buf = Buffer.alloc(row.length)
        if (fs.readSync(fd, buf, 0, buf.length, row.offset) !== buf.length) throw new Error('邮件读取不完整')
        const r: MessageRow = JSON.parse(buf.toString('utf8'))
        if (r.message_id !== row.id) throw new Error('邮件位置已改变')
        return {
          id: row.id,
          at: row.at,
          outgoing: row.outgoing,
          subject: r.subject || '（无主题）',
          ...(r.html_body?.trim() ? { body: body(r) } : splitQuotedText(body(r))),
          replyTo: this.replyTarget(r, contact),
          html: r.html_body?.trim() ? readableHtml(r.html_body) : undefined,
          from: r.from,
          to: r.to ?? [],
          cc: r.cc ?? [],
          bcc: r.bcc ?? [],
          attachments: (r.attachments ?? []).map(({ filename, size_bytes }) => ({ filename, size_bytes })),
        }
      } finally {
        fs.closeSync(fd)
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
