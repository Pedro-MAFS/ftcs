import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { ParsedMail } from 'mailparser'
import type { ImportIndex, MessageRow } from './conversations'
import { append, eachLine, read, readAt, save, uuid, type Position } from './storage'
import { key, type MailAddress } from './types'
import {
  envelope,
  validAddress,
  type ComposerAction,
  type ComposerView,
  type Draft,
  type DraftInput,
  type SendResult,
  type Version,
} from './compose-types'
import { localAttachment } from './attachments'

interface Attempt extends SendResult {
  attempt_id: string
  request_id: string
  message_id: string
  internet_message_id: string
  created_at: string
  rev: number
  snapshot: Draft
  from: string
  in_reply_to?: string
  references: string[]
}
type SendCommand = Extract<ComposerAction, { kind: 'send' }>
type AttemptEntry = Omit<Attempt, 'snapshot'> & {
  position: Position
  email: string
  contact: string
  draft: string
  draftRev: number
  copy_seen?: boolean
}
export type SubmitMail = (
  attempt: Attempt,
  files: { filename: string; path: string }[],
) => Promise<SendResult>
const validId = (id?: string) => !!id && /^<[^<>\s]+>$/.test(id)
const normalizedText = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '')
const addressSet = (list: MailAddress[]) =>
  list
    .map((a) => key(a.email))
    .sort()
    .join('\n')
function status(a?: SendResult): SendResult | undefined {
  if (a)
    return {
      attempt_id: a.attempt_id,
      state: a.state,
      detail: a.detail,
      accepted: a.accepted,
      rejected: a.rejected,
    }
}
export class ComposerStore {
  private drafts = new Map<string, Draft>()
  private attempts = new Map<string, AttemptEntry>()
  private byInternetId = new Map<string, AttemptEntry>()
  private latest = new Map<string, AttemptEntry>()
  private attachmentHistory = new Set<string>()
  constructor(
    private dir: string,
    private index: ImportIndex,
  ) {}
  private draftPath(contact: string) {
    if (!uuid(contact)) throw new Error('无效的草稿联系人。')
    return path.join(this.dir, 'drafts', contact + '.json')
  }
  private logPath(a: { created_at: string }) {
    return path.join(this.dir, 'sends', a.created_at.slice(0, 7) + '.jsonl')
  }
  private remember({ snapshot, ...fields }: Attempt, position: Position): AttemptEntry {
    const a = {
      ...fields,
      position,
      email: snapshot.email,
      contact: snapshot.contact_id,
      draft: snapshot.draft_id,
      draftRev: snapshot.rev,
    }
    this.attempts.set(a.request_id, a)
    this.byInternetId.set(a.internet_message_id, a)
    this.latest.set(a.draft, a)
    for (const file of snapshot.attachments) this.attachmentHistory.add(file.attachment_id)
    return a
  }
  async restore(guard: () => void) {
    const drafts = path.join(this.dir, 'drafts'),
      sends = path.join(this.dir, 'sends')
    if (fs.existsSync(drafts))
      for (const f of fs.readdirSync(drafts)) {
        if (f.endsWith('.json') && uuid(f.slice(0, -5)))
          this.drafts.set(f.slice(0, -5), read<Draft>(path.join(drafts, f)))
      }
    if (fs.existsSync(sends))
      for (const f of fs
        .readdirSync(sends)
        .filter((n) => /^\d{4}-\d{2}\.jsonl$/.test(n))
        .sort()) {
        await eachLine(
          path.join(sends, f),
          (event, position) => {
            if (event.snapshot) this.remember(event, position)
            else {
              const a = this.attempts.get(event.request_id)
              if (a && event.rev > a.rev) Object.assign(a, event)
            }
          },
          guard,
        )
        guard()
      }
    for (const a of this.attempts.values()) {
      if (a.state === 'submitting')
        this.record(
          a,
          a.copy_seen
            ? { state: 'accepted', detail: '已发送副本已核对' }
            : { state: 'unknown', detail: '上次提交中断，请检查已发送邮件。' },
        )
      if (a.state === 'accepted') this.publish(a)
    }
  }
  temporary() {
    return Array.from(this.drafts.values())
      .filter((d) => !this.index.hasConversation(d.contact_id))
      .map((d) => d.email)
  }
  preview(contact: string) {
    const d = this.drafts.get(contact)
    if (d) return d.text_body.trim().slice(0, 80) || d.subject || d.attachments[0]?.filename || '引用回复'
  }
  delivery(message: string, id?: string) {
    const entry = this.byInternetId.get(id ?? '')
    if (entry?.message_id === message) return status(entry)
  }
  private existing(email: string) {
    if (!validAddress(email)) throw new Error('收件邮箱无效。')
    return this.drafts.get(this.index.contacts.get(key(email)) ?? '')
  }
  view(email: string, self: string): ComposerView {
    const saved = this.existing(email)
    const completed = saved && this.latest.get(saved.draft_id)
    if (saved && completed?.state === 'accepted' && completed.draftRev === saved.rev) {
      this.publish(completed)
      return this.view(email, self)
    }
    const edit = { mode: 'new' as const, text_body: '' }
    const draft = saved ?? {
      ...edit,
      ...envelope(email, self, edit),
      draft_id: randomUUID(),
      contact_id: this.index.contacts.get(key(email)) ?? '',
      rev: 0,
      email,
      attachments: [],
      updated_at: '',
    }
    const a = this.latest.get(draft.draft_id)
    return {
      draft,
      quote: draft.quoted_message_id
        ? this.index.original(draft.quoted_message_id, draft.contact_id).quote
        : undefined,
      result: a?.draftRev === draft.rev ? status(a) : undefined,
    }
  }
  private version(email: string, v: Version) {
    const d = this.existing(email)
    if (
      !uuid(v.draft_id) ||
      (d ? d.draft_id !== v.draft_id || d.rev !== v.rev : v.rev !== 0 || this.latest.has(v.draft_id))
    )
      throw new Error('草稿版本已改变，请重新载入后核对。')
    const a = this.latest.get(v.draft_id)
    if (a?.draftRev === v.rev && a.state !== 'failed') throw new Error('这份草稿正在发送或等待核对。')
    return d
  }
  write(
    email: string,
    self: string,
    v: Version,
    edit: DraftInput,
    attachments?: Draft['attachments'],
  ): ComposerView {
    const old = this.version(email, v)
    if (typeof edit.text_body !== 'string' || !['new', 'reply', 'reply_all'].includes(edit.mode))
      throw new Error('无效的草稿。')
    const files = attachments ?? old?.attachments ?? []
    const contact = this.index.contacts.get(key(email))
    const quote =
      edit.mode === 'new' ? undefined : this.index.original(edit.quoted_message_id ?? '', contact ?? '').quote
    const fields = envelope(email, self, edit, quote)
    if (/[\r\n\0]/.test(fields.subject)) throw new Error('邮件主题必须是单行。')
    if (!quote && !edit.text_body && !edit.new_subject_override && !files.length) {
      if (old) {
        fs.rmSync(this.draftPath(old.contact_id), { force: true })
        this.drafts.delete(old.contact_id)
      }
      return this.view(email, self)
    }
    const draft: Draft = {
      ...fields,
      text_body: edit.text_body,
      mode: edit.mode,
      quoted_message_id: quote?.id,
      new_subject_override: edit.new_subject_override,
      reply_subject_override: quote ? edit.reply_subject_override : undefined,
      draft_id: v.draft_id,
      rev: v.rev + 1,
      contact_id: contact ?? this.index.ensureContact({ email }),
      email,
      updated_at: new Date().toISOString(),
      attachments: files,
    }
    save(this.draftPath(draft.contact_id), { v: 1, ...draft })
    this.drafts.set(draft.contact_id, draft)
    return this.view(email, self)
  }
  remove(email: string, self: string, v: Version, id: string) {
    const d = this.version(email, v)
    if (!d?.attachments.some((a) => a.attachment_id === id)) throw new Error('草稿中找不到附件。')
    const view = this.write(
      email,
      self,
      v,
      d,
      d.attachments.filter((a) => a.attachment_id !== id),
    )
    // Picker-created bytes remain owned by any frozen send snapshot.
    if (
      uuid(id) &&
      !this.attachmentHistory.has(id) &&
      !Array.from(this.drafts.values()).some((d) => d.attachments.some((f) => f.attachment_id === id))
    )
      fs.rmSync(path.join(this.dir, 'attachments', id), { force: true, recursive: true })
    return view
  }
  async addFile(email: string, self: string, v: Version, file: string, guard: () => void) {
    const d = this.version(email, v)
    const id = randomUUID(),
      dir = path.join(this.dir, 'attachments', id),
      content = path.join(dir, 'content')
    fs.mkdirSync(dir, { recursive: true })
    try {
      const hash = createHash('sha256')
      const stream = fs.createReadStream(file)
      stream.on('data', (chunk) => hash.update(chunk))
      const temp = path.join(dir, 'content.tmp')
      await pipeline(stream, fs.createWriteStream(temp, { flags: 'wx', mode: 0o600, flush: true }))
      guard()
      fs.renameSync(temp, content)
      const attachment = {
        attachment_id: id,
        filename: path.basename(file),
        size_bytes: fs.statSync(content).size,
        sha256: hash.digest('hex'),
      }
      return this.write(email, self, v, d ?? { mode: 'new', text_body: '' }, [
        ...(d?.attachments ?? []),
        attachment,
      ])
    } catch (e) {
      fs.rmSync(dir, { force: true, recursive: true })
      throw e
    }
  }
  private record(a: AttemptEntry, result: SendResult & { copy_seen?: boolean }) {
    const event = {
      attempt_id: a.attempt_id,
      request_id: a.request_id,
      rev: a.rev + 1,
      updated_at: new Date().toISOString(),
      ...result,
    }
    append(this.logPath(a), event)
    Object.assign(a, event)
  }
  private publish(a: AttemptEntry) {
    if (!this.index.hasMessage(a.message_id)) {
      const d = readAt<Attempt>(a.position).snapshot
      const now = new Date().toISOString()
      const row: MessageRow = {
        message_id: a.message_id,
        internet_message_id: a.internet_message_id,
        direction: 'outgoing',
        occurred_at: a.created_at,
        ingested_at: now,
        from: { email: a.from },
        to: d.to,
        cc: d.cc,
        subject: d.subject,
        text_body: d.text_body,
        in_reply_to: a.in_reply_to,
        references: a.references,
        quoted_message_id: d.quoted_message_id,
        attachments: d.attachments,
        conversation_contact_ids: [d.contact_id],
      }
      this.index.message(row, append(path.join(this.dir, 'messages', now.slice(0, 7) + '.jsonl'), row))
    }
    const old = this.drafts.get(a.contact)
    if (old?.draft_id === a.draft && old.rev === a.draftRev) {
      fs.rmSync(this.draftPath(a.contact), { force: true })
      this.drafts.delete(a.contact)
    }
  }
  async send(
    email: string,
    self: string,
    action: SendCommand,
    submit: SubmitMail,
    guard: () => void,
    notify: () => void,
  ): Promise<SendResult> {
    if (!uuid(action.request)) throw new Error('发送请求无效。')
    const prior = this.attempts.get(action.request) ?? this.latest.get(action.version.draft_id)
    if (
      prior &&
      (key(prior.email) !== key(email) ||
        prior.draft !== action.version.draft_id ||
        (prior.request_id === action.request && prior.draftRev !== action.version.rev))
    )
      throw new Error('发送请求与草稿不一致。')
    if (
      prior &&
      (prior.request_id === action.request ||
        (prior.draftRev === action.version.rev && prior.state !== 'failed'))
    ) {
      if (prior.state === 'accepted') this.publish(prior)
      return status(prior)!
    }
    const d = this.version(email, action.version)
    if (!d || !d.subject.trim() || (!d.text_body.trim() && !d.attachments.length))
      throw new Error('请填写主题，并输入正文或添加附件。')
    const original = d.quoted_message_id ? this.index.original(d.quoted_message_id, d.contact_id) : undefined
    const fields = envelope(email, self, d, original?.quote)
    if (
      !fields.to.length ||
      JSON.stringify(fields.to.map((a) => a.email)) !== JSON.stringify(action.to) ||
      JSON.stringify(fields.cc.map((a) => a.email)) !== JSON.stringify(action.cc) ||
      fields.subject !== d.subject
    )
      throw new Error('收件人或主题已变化，请重新核对草稿。')
    const parent = original?.record.internet_message_id
    const references = validId(parent)
      ? [...new Set([...(original?.record.references ?? []).filter(validId), parent!])]
      : []
    const files = d.attachments.map((f) => ({
      filename: f.filename,
      path: localAttachment(this.dir, f).content,
    }))
    const a: Attempt = {
      request_id: action.request,
      attempt_id: randomUUID(),
      message_id: randomUUID(),
      internet_message_id: '<' + randomUUID() + '@' + self.split('@')[1] + '>',
      rev: 1,
      created_at: new Date().toISOString(),
      state: 'submitting',
      snapshot: { ...d, ...fields },
      from: self,
      references,
      in_reply_to: references.length ? parent : undefined,
    }
    const entry = this.remember(a, append(this.logPath(a), a))
    notify()
    let result: SendResult
    try {
      result = await submit(a, files)
    } catch {
      result = { state: 'unknown', detail: '服务器是否接受此邮件尚未确认。' }
    }
    guard()
    try {
      this.record(
        entry,
        entry.copy_seen && result.state !== 'accepted'
          ? { state: 'accepted', detail: '已发送副本已核对', rejected: result.rejected }
          : result,
      )
      if (entry.state === 'accepted') this.publish(entry)
    } catch {
      if (entry.state === 'submitting') entry.state = 'unknown'
      notify()
      throw new Error('发送结果未能完整写入本机，请检查磁盘后重新打开邮箱并核对已发送邮件。')
    }
    notify()
    return status(entry)!
  }
  matchCopy(mail: ParsedMail, sender: MailAddress | undefined, to: MailAddress[], cc: MailAddress[]) {
    const a = this.byInternetId.get(mail.messageId ?? '')
    if (!a || !sender || key(sender.email) !== key(a.from)) return
    const d = readAt<Attempt>(a.position).snapshot
    if (
      mail.subject !== d.subject ||
      addressSet(to) !== addressSet(d.to) ||
      addressSet(cc) !== addressSet(d.cc) ||
      normalizedText(mail.text ?? '') !== normalizedText(d.text_body) ||
      mail.attachments.length !== d.attachments.length
    )
      return
    if (
      mail.attachments.some(
        (f, i) =>
          f.filename !== d.attachments[i].filename ||
          createHash('sha256').update(f.content).digest('hex') !== d.attachments[i].sha256,
      )
    )
      return
    if (a.state === 'submitting') {
      if (!a.copy_seen) this.record(a, { state: 'submitting', copy_seen: true })
      return a.message_id
    }
    if (a.state !== 'accepted') this.record(a, { state: 'accepted', detail: '已发送副本已核对' })
    this.publish(a)
    return a.message_id
  }
}
