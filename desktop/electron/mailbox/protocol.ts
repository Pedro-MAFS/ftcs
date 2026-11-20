import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { SubmitMail } from './composer-store'
import type { Endpoint, Connection } from './types'

export function imapClient(e: Endpoint, password: string) {
  const client = new ImapFlow({
    host: e.host,
    port: e.port,
    secure: e.security === 'tls',
    doSTARTTLS: e.security === 'starttls',
    auth: { user: e.username, pass: password },
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: 15000,
    socketTimeout: 60000,
  })
  client.on('error', () => {
    /* Pending protocol operations reject on disconnect. */
  })
  return client
}
export function diagnostic(err: unknown) {
  const { code, message, authenticationFailed } = err as {
    code?: string
    message?: string
    authenticationFailed?: boolean
  }
  if (
    authenticationFailed ||
    code === 'EAUTH' ||
    /authentication|invalid credentials|login failed/i.test(message ?? '')
  )
    return '认证失败，请检查登录名、授权码及邮箱协议开关。'
  if (/tls|cert|ssl|starttls/i.test((code ?? '') + ' ' + message))
    return 'TLS 验证失败，请检查主机、端口与加密方式。'
  if (code === 'ENOSPC' || code === 'EACCES' || code === 'EPERM')
    return '无法写入本地邮箱，请检查磁盘空间及权限。'
  return '请求未完成，请检查网络、服务器配置或文件夹权限后重试。'
}
// A final socket error can omit RCPT rejections already returned by the server.
// Consume only envelope command/reply pairs in order, including PIPELINING batches.
function recipientReplies() {
  const pending: (string | null)[] = []
  const rejected = new Set<string>()
  const logger = {
    debug(entry: { tnx?: string }, line: string) {
      if (entry.tnx === 'client') {
        if (line.startsWith('MAIL FROM:')) pending.push(null)
        const recipient = /^RCPT TO:<([^>]+)>/.exec(line)
        if (recipient) pending.push(recipient[1])
      } else if (entry.tnx === 'server' && pending.length) {
        const recipient = pending.shift()
        if (recipient && /^[45]\d\d[ -]/.test(line)) rejected.add(recipient)
      }
    },
  }
  return { logger, rejected }
}
function smtpClient(e: Endpoint, password: string, replies?: ReturnType<typeof recipientReplies>) {
  return nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.security === 'tls',
    forceAuth: true,
    requireTLS: e.security === 'starttls',
    auth: { user: e.username, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    ...(replies && { transactionLog: true, logger: replies.logger }),
  })
}
export function smtpSubmit(e: Endpoint, password: string, signal: AbortSignal): SubmitMail {
  return async (a, attachments) => {
    const replies = recipientReplies()
    const smtp = smtpClient(e, password, replies)
    try {
      const fields = (list: typeof a.snapshot.to) =>
        list.map((p) => ({ address: p.email, name: p.name ?? '' }))
      const info = await smtp.sendMail({
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
      })
      return { state: 'accepted', accepted: info.accepted.map(String), rejected: info.rejected.map(String) }
    } catch (error) {
      const err = error as {
        code?: string
        originalCode?: string
        timeoutType?: string
        syscall?: string
        responseCode?: number
        rejected?: string[]
      }
      const definite =
        (err.responseCode ?? 0) >= 400 ||
        ['EAUTH', 'EENVELOPE', 'EDNS', 'ETLS', 'ECONNREFUSED'].includes(err.code ?? '') ||
        err.syscall === 'connect' ||
        err.originalCode === 'ECONNREFUSED' ||
        ['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(err.timeoutType ?? '')
      return {
        state: definite ? 'failed' : 'unknown',
        detail: definite
          ? err.responseCode
            ? '发件服务器拒绝提交（SMTP ' + err.responseCode + '）'
            : diagnostic(err)
          : '未取得最终回执，请检查已发送邮件。',
        rejected: err.rejected ?? [...replies.rejected],
      }
    } finally {
      smtp.close()
    }
  }
}
export async function verify(f: Connection) {
  const client = imapClient(f.imap, f.password)
  const smtp = smtpClient(f.smtp, f.password)
  try {
    const results = await Promise.allSettled([
      (async () => {
        await client.connect()
        await client.mailboxOpen('INBOX', { readOnly: true })
      })(),
      smtp.verify(),
    ])
    if (results.some((r) => r.status === 'rejected'))
      throw new Error(
        results
          .map(
            (r, i) =>
              (i ? '发信' : '收信') + '：' + (r.status === 'fulfilled' ? '验证通过' : diagnostic(r.reason)),
          )
          .join('  '),
      )
  } finally {
    client.close()
    smtp.close()
  }
}
