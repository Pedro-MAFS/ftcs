import { key, type MailAddress } from './types'

export interface QuoteSource {
  id: string
  subject: string
  snippet: string
  outgoing: boolean
  from?: MailAddress
  replyTo: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  threaded: boolean
}
export interface MailBody {
  text_body: string
  html_body?: string
}
export interface DraftInput extends MailBody {
  template_applied?: boolean
  new_subject_override?: string
  reply_subject_override?: string
  quoted_message_id?: string
  mode: 'new' | 'reply' | 'reply_all'
}
export interface Version {
  draft_id: string
  rev: number
}
export interface DraftAttachment {
  attachment_id: string
  filename: string
  size_bytes: number
  sha256: string
}
export interface Draft extends Version, DraftInput {
  contact_id: string
  email: string
  subject: string
  subject_mode: 'manual' | 'first_line' | 'inherited'
  to: MailAddress[]
  cc: MailAddress[]
  attachments: DraftAttachment[]
  updated_at: string
}
export interface SendResult {
  attempt_id?: string
  state: 'submitting' | 'accepted' | 'failed' | 'unknown'
  detail?: string
  rejected?: string[]
  accepted?: string[]
}
export interface ComposerView {
  draft: Draft
  bodyTemplate?: MailBody
  quote?: QuoteSource
  result?: SendResult
  attachmentErrors?: string[]
}
export type ComposerAction =
  | { kind: 'get' }
  | { kind: 'get-template' }
  | { kind: 'set-template'; body: MailBody }
  | { kind: 'save'; version: Version; edit: DraftInput }
  | { kind: 'pick'; version: Version }
  | { kind: 'remove'; version: Version; attachment: string }
  | { kind: 'send'; version: Version; request: string; to: string[]; cc: string[] }

export function validAddress(email: string) {
  return (
    typeof email === 'string' && /^[^@\s\x00-\x1f\x7f<>,;:"\\]+@[^@\s\x00-\x1f\x7f<>,;:"\\]+$/.test(email)
  )
}
export function envelope(email: string, self: string, edit: DraftInput, quote?: QuoteSource) {
  const reply = !!quote && edit.mode !== 'new'
  const seen = new Set(reply ? [key(self)] : [])
  function unique(list: MailAddress[]) {
    return list.filter(({ email }) => {
      const address = key(email)
      if (!validAddress(email) || seen.has(address)) return false
      seen.add(address)
      return true
    })
  }
  const all = reply && edit.mode === 'reply_all'
  const replyAddresses = quote?.replyTo.filter((a) => validAddress(a.email)) ?? []
  const base =
    reply && !quote.outgoing
      ? replyAddresses.length
        ? replyAddresses
        : quote.from
          ? [quote.from]
          : []
      : [{ email }]
  const to = unique(all ? (quote.outgoing ? quote.to : [...base, ...quote.to]) : base)
  const cc = unique(all ? quote.cc : [])
  const manual = reply ? edit.reply_subject_override : edit.new_subject_override
  const inherited = quote?.subject.trim() || ''
  const subject =
    manual ??
    (reply
      ? inherited && !/^(re|回复|答复)\s*[:：]/i.test(inherited)
        ? 'Re: ' + inherited
        : inherited
      : edit.text_body.split(/\r?\n/, 1)[0].trim())
  return {
    to,
    cc,
    subject,
    subject_mode:
      manual !== undefined ? ('manual' as const) : reply ? ('inherited' as const) : ('first_line' as const),
  }
}
