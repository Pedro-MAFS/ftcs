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
  pinned?: boolean
  display_name?: string
  company?: string
  rev: number
}
export interface MessageRow {
  source?: import('./outreach-types').OutreachSource
  ftcs_send_id?: unknown
  origin_copy?: { folder_id: string; uid_validity: number; uid: number }
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
  internetId?: string
  storedId: string
  quoted?: string
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
  deliveryChanged(id: string) {
    for (const contact of this.positions.get(id)?.contacts ?? [])
      this.revisions.set(contact, (this.revisions.get(contact) ?? 0) + 1)
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
  setPinned(id: string, pinned: boolean) {
    const person = this.people.get(id)
    if (!person || !this.hasConversation(id)) throw new Error('当前账号中没有这个联系人会话。')
    if ((person.pinned ?? false) === pinned) return
    const next = { ...person, pinned, updated_at: new Date().toISOString(), rev: person.rev + 1 }
    append(path.join(this.dir, 'contacts.jsonl'), next)
    this.contact(next)
  }
  original(id: string, contact: string) {
    const row = this.positions.get(this.aliases.get(id) ?? id)
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
  private aliases = new Map<string, string>()
  private sentByHeader = new Map<string, string>()
  currentInternetId(messageId: string) {
    return this.positions.get(messageId)?.internetId
  }
  knownSent(id: string | undefined, marker: unknown) {
    const marked =
      typeof marker === 'string' && marker ? this.sentByHeader.get('marker/' + marker) : undefined
    const byId = id ? this.sentByHeader.get('id/' + id) : undefined
    const messageId = marked ?? byId
    if (messageId) return { messageId, replace: !!(marked && id && this.currentInternetId(marked) !== id) }
  }
  private revisions = new Map<string, number>()
  private states = new Map<string, CopyRow>()
  private copiesByMessage = new Map<string, Set<string>>()
  get count() {
    return this.positions.size
  }
  static async load(dir: string, guard: () => void) {
    const index = new ImportIndex(dir)
    const contacts = path.join(dir, 'contacts.jsonl')
    if (fs.existsSync(contacts)) await eachLine(contacts, (r) => index.contact(r), guard)
    await index.composer.restore(guard)
    guard()
    for (const kind of ['messages', 'copies']) {
      const base = path.join(dir, kind)
      if (!fs.existsSync(base)) continue
      for (const file of fs
        .readdirSync(base)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()) {
        guard()
        await eachLine(
          path.join(base, file),
          (r, pos) => {
            if (kind === 'messages') index.restoreMessage(r, pos)
            else index.copy(file.slice(0, -6), r)
          },
          guard,
        )
      }
    }
    guard()
    index.composer.recover()
    return index
  }
  contact(r: ContactRow) {
    if ((this.people.get(r.contact_id)?.rev ?? 0) > r.rev) return
    this.people.set(r.contact_id, r)
    this.contacts.set(r.address_key, r.contact_id)
  }
  private restoreMessage(r: MessageRow, pos: Position) {
    const a =
      r.direction === 'outgoing' &&
      r.origin_copy &&
      this.composer.matchCopy(r.internet_message_id, r.ftcs_send_id)
    if (a) {
      const id = a.message_id
      if (r.message_id !== id) this.aliases.set(r.message_id, id)
      if (r.import_key) this.messages.set(r.import_key, id)
      const marked = r.ftcs_send_id === a.attempt_id
      this.composer.restoreCopy(a, marked ? r.internet_message_id : undefined)
      if (
        marked &&
        r.internet_message_id &&
        (r.message_id === id || r.internet_message_id !== a.internet_message_id)
      ) {
        const context = this.composer.copyContext(a)
        this.message(
          {
            ...r,
            message_id: id,
            conversation_contact_ids: [context.contact],
            quoted_message_id: context.quoted,
          },
          pos,
          true,
          r.message_id,
        )
      }
      return
    }
    if (r.direction === 'outgoing' && r.origin_copy) {
      const known = this.knownSent(r.internet_message_id, r.ftcs_send_id)
      if (known) {
        if (r.message_id !== known.messageId) this.aliases.set(r.message_id, known.messageId)
        if (r.import_key) this.messages.set(r.import_key, known.messageId)
        if (known.replace) this.message({ ...r, message_id: known.messageId }, pos, true, r.message_id)
        return
      }
    }
    this.message(r, pos)
  }
  message(r: MessageRow, pos: Position, replace = false, storedId = r.message_id) {
    if (r.import_key) this.messages.set(r.import_key, r.message_id)
    if (r.origin_copy && r.direction === 'outgoing') {
      if (r.internet_message_id) this.sentByHeader.set('id/' + r.internet_message_id, r.message_id)
      if (typeof r.ftcs_send_id === 'string' && r.ftcs_send_id)
        this.sentByHeader.set('marker/' + r.ftcs_send_id, r.message_id)
    }
    const previous = this.positions.get(r.message_id)
    if (previous && !replace) return
    if (previous)
      for (const contact of previous.contacts) {
        const list = this.byContact.get(contact)!
        list.splice(lowerBound(list, previous), 1)
        if (!list.length) this.byContact.delete(contact)
        this.revisions.set(contact, (this.revisions.get(contact) ?? 0) + 1)
      }
    const snippet =
      body(r).slice(0, 256).replace(/\s+/g, ' ').trim() ||
      r.attachments?.[0]?.filename ||
      r.subject ||
      '无正文'
    const row = {
      ...pos,
      storedId,
      internetId: r.internet_message_id,
      quoted: r.quoted_message_id,
      id: r.message_id,
      at: r.occurred_at || r.ingested_at,
      outgoing: r.direction === 'outgoing',
      preview: snippet.slice(0, 120),
      subject: r.subject || '（无主题）',
      contacts: r.conversation_contact_ids,
    }
    this.positions.set(row.id, row)
    const internetId = r.internet_message_id?.trim()
    if (internetId) {
      const prior = this.internetIds.get(internetId)
      this.internetIds.set(internetId, prior === undefined || prior?.id === row.id ? row : null)
    }
    for (const contact of new Set(r.conversation_contact_ids)) {
      const list = this.byContact.get(contact) ?? []
      list.splice(lowerBound(list, row), 0, row)
      this.byContact.set(contact, list)
    }
  }
  copy(folder: string, r: CopyRow) {
    const canonical = this.aliases.get(r.message_id)
    if (canonical) r = { ...r, message_id: canonical }
    const id = folder + ':' + r.uid_validity + ':' + r.uid
    this.copies.add(id)
    const previous = this.states.get(id)
    if (previous && previous.rev > r.rev) return
    this.states.set(id, r)
    if (previous?.present === r.present && previous.message_id === r.message_id) return
    if (previous) this.copiesByMessage.get(previous.message_id)?.delete(id)
    if (r.present) {
      const keys = this.copiesByMessage.get(r.message_id) ?? new Set<string>()
      keys.add(id)
      this.copiesByMessage.set(r.message_id, keys)
    }
  }
  inboxCopies(inbox: Folder) {
    const prefix = inbox.folder_id + ':' + inbox.uid_validity + ':'
    return Array.from(this.states.entries())
      .filter(([key, row]) => key.startsWith(prefix) && row.present)
      .map(([, row]) => row)
  }
  changeCopy(
    folder: Folder,
    uid: number,
    delta: Partial<Pick<CopyRow, 'present' | 'pending_seen' | 'seen'>>,
  ) {
    const current = this.states.get(folder.folder_id + ':' + folder.uid_validity + ':' + uid)
    if (!folder.folder_id || !current?.present) return false
    const next = { ...current, ...delta }
    if (
      current.seen === next.seen &&
      current.pending_seen === next.pending_seen &&
      current.present === next.present
    )
      return false
    const row = { ...next, rev: current.rev + 1, updated_at: new Date().toISOString() }
    append(path.join(this.dir, 'copies', folder.folder_id + '.jsonl'), row)
    this.copy(folder.folder_id, row)
    this.deliveryChanged(row.message_id)
    return true
  }
  markRead(inbox: Folder, contact: string, ids: Set<string>) {
    let changed = false
    const prefix = inbox.folder_id + ':' + inbox.uid_validity + ':'
    for (const message of ids) {
      const row = this.positions.get(message)
      if (!row || row.outgoing || !row.contacts.includes(contact)) continue
      for (const key of this.copiesByMessage.get(message) ?? []) {
        const copy = this.states.get(key)!
        if (key.startsWith(prefix) && !(copy.pending_seen ?? copy.seen))
          changed = this.changeCopy(inbox, copy.uid, { pending_seen: true }) || changed
      }
    }
    return changed
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
        pinned: person.pinned ?? false,
        company: person.company,
        lastAt: last.at,
        lastId: last.id,
        revision: this.revisions.get(id),
        draftPreview: this.composer.preview(id),
        preview: (last.outgoing ? '我：' : '') + last.preview,
        count: list.length,
        unread: list.reduce((n, m) => n + Number(unread.has(m.id)), 0),
      })
    }
    return result.sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) || cmp(b.lastAt, a.lastAt) || cmp(b.lastId, a.lastId) || cmp(a.id, b.id),
    )
  }
  private readRecord(row: Summary): MessageRow {
    const record = readAt<MessageRow>(row)
    if (record.message_id !== row.storedId) throw new Error('邮件位置已改变')
    return {
      ...record,
      message_id: row.id,
      quoted_message_id: row.quoted,
      conversation_contact_ids: row.contacts,
    }
  }
  attachment(messageId: string, ordinal: number) {
    const row = this.positions.get(this.aliases.get(messageId) ?? messageId)
    const attachment =
      row && Number.isSafeInteger(ordinal) && ordinal >= 0
        ? this.readRecord(row).attachments?.[ordinal]
        : undefined
    if (!attachment) throw new Error('此邮件中找不到这个附件。')
    return attachment
  }
  private replyTarget(row: MessageRow, contact: string) {
    if (row.quoted_message_id) {
      const parent = this.positions.get(this.aliases.get(row.quoted_message_id) ?? row.quoted_message_id)
      if (parent?.contacts.includes(contact)) return { id: parent.id, contact, subject: parent.subject }
    }
    const direct = [row.in_reply_to ?? []].flat().join(' ').trim()
    const id = direct || row.references?.at(-1)?.trim()
    // Multiple parents or malformed headers do not identify one original message.
    if (!id || !/^<[^<>\s]+>$/.test(id)) return
    const copied = this.composer.copiedMessage(id) ?? this.composer.matchCopy(id, undefined)?.message_id
    let parent = this.internetIds.get(id)
    if (copied === null || (copied && this.internetIds.has(id) && parent?.id !== copied)) return
    if (copied) parent = this.positions.get(copied)
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
    unread?: Set<string>,
  ): Promise<TimelinePage> {
    const rows = this.byContact.get(contact)
    if (!rows) throw new Error('当前账号中没有这个会话。')
    let end = before ? lowerBound(rows, before) : rows.length
    let start = Math.max(0, end - 30)
    if (aroundId) {
      const target = this.positions.get(this.aliases.get(aroundId) ?? aroundId)
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
        unread: unread?.has(row.id),
        subject: r.subject || '（无主题）',
        ...(r.html_body?.trim() ? { body: text } : splitQuotedText(text)),
        quoteSource: quoteSource(r, text),
        source: r.source,
        delivery: this.composer.delivery(r.message_id),
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
            const stored = this.positions.get(this.aliases.get(r.message_id) ?? r.message_id)
            if (stored?.file === file && stored.storedId === r.message_id) Object.assign(stored, pos)
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
