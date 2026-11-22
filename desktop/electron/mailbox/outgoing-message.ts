import type { SubmitMail } from './composer-store'

export function outgoingMessage(a: Parameters<SubmitMail>[0], attachments: Parameters<SubmitMail>[1], signal: AbortSignal) {
  const fields = (list: typeof a.snapshot.to) =>
    list.map((p) => ({ address: p.email, name: p.name ?? '' }))
  return {
    from: { address: a.from, name: '' },
    to: fields(a.snapshot.to),
    cc: fields(a.snapshot.cc),
    subject: a.snapshot.subject,
    text: a.snapshot.text_body,
    html: a.snapshot.html_body,
    attachDataUrls: true,
    attachments,
    date: new Date(a.created_at),
    messageId: a.internet_message_id,
    headers: { 'X-FTCS-Send-ID': a.attempt_id },
    inReplyTo: a.in_reply_to,
    references: a.references.length ? a.references : undefined,
    signal,
    disableUrlAccess: true,
  }
}
