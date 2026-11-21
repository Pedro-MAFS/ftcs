import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { SubmitMail } from './composer-store'
import type { Endpoint, AccountSettings } from './types'

export type MailCredential = string | { accessToken: string }

export function imapClient(e: Endpoint, credential: MailCredential) {
  const client = new ImapFlow({
    host: e.host,
    port: e.port,
    secure: e.security === 'tls',
    doSTARTTLS: e.security === 'starttls',
    auth: typeof credential === 'string' ? { user: e.username, pass: credential } : { user: e.username, accessToken: credential.accessToken },
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
export function diagnostic(err: unknown, google = false) {
  const { code, message, authenticationFailed } = err as {
    code?: string
    message?: string
    authenticationFailed?: boolean
  }
  if (code === 'GMAIL_REAUTH') return 'Google 授权已失效，请重新连接 Gmail。'
  if (
    authenticationFailed ||
    code === 'EAUTH' ||
    /authentication|invalid credentials|login failed/i.test(message ?? '')
  )
    return google ? 'Google 邮箱认证失败，请重新连接 Gmail 并确认账号允许邮件客户端访问。' : '认证失败，请检查登录名、授权码及邮箱协议开关。'
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
function smtpClient(e: Endpoint, credential: MailCredential, replies?: ReturnType<typeof recipientReplies>) {
  return nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.security === 'tls',
    forceAuth: true,
    requireTLS: e.security === 'starttls',
    auth: typeof credential === 'string' ? { user: e.username, pass: credential } : { type: 'OAuth2', user: e.username, accessToken: credential.accessToken },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    ...(replies && { transactionLog: true, logger: replies.logger }),
  })
}
export function smtpSubmit(e: Endpoint, credential: MailCredential, signal: AbortSignal): SubmitMail {
  return async (a, attachments) => {
    const replies = recipientReplies()
    const smtp = smtpClient(e, credential, replies)
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
            : diagnostic(err, typeof credential !== 'string')
          : '未取得最终回执，请检查已发送邮件。',
        rejected: err.rejected ?? [...replies.rejected],
      }
    } finally {
      smtp.close()
    }
  }
}
async function probeSmtp(endpoint: Endpoint, credential: MailCredential) {
  const transport = smtpClient(endpoint, credential)
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}

export async function verifySmtp(endpoint: Endpoint, credential: MailCredential, probe = probeSmtp) {
  const candidates = [endpoint]
  const google = typeof credential !== 'string'
  if (google && endpoint.host === 'smtp.gmail.com' && endpoint.port === 465 && endpoint.security === 'tls') {
    candidates.push({ ...endpoint, port: 587, security: 'starttls' })
  }
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      await probe(candidate, credential)
      return candidate
    } catch (error) {
      const err = error as { code?: string; originalCode?: string; timeoutType?: string; command?: string; message?: string }
      const code = err.originalCode || err.code || ''
      const auth = err.command?.startsWith('AUTH') || err.code === 'EAUTH' || err.code === 'EOAUTH2'
      const detail = auth ? diagnostic({ code: 'EAUTH' }, google) : smtpConnectionDetail(err, google)
      const label = candidate.security === 'tls' ? 'TLS' : 'STARTTLS'
      const suffix = /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? ' (' + code + ')' : ''
      failures.push(candidate.host + ':' + candidate.port + ' ' + label + ' — ' + detail + suffix)
      if (auth || !['ESOCKET', 'ETLS', 'ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code || '')) break
    }
  }
  throw new Error(failures.join('；'))
}

function smtpConnectionDetail(err: { code?: string; originalCode?: string; timeoutType?: string; message?: string }, google: boolean) {
  const code = err.originalCode || err.code || ''
  switch (err.timeoutType) {
    case 'CONNECT_TIMEOUT': return '建立服务器连接超时。'
    case 'GREETING_TIMEOUT': return '服务器未在规定时间内返回 SMTP 问候。'
    case 'UPGRADE_TIMEOUT': return '升级 TLS 连接超时。'
  }
  if (code === 'ECONNREFUSED') return '服务器连接被拒绝。'
  if (code === 'ECONNRESET' || /connection closed|socket disconnected/i.test(err.message || '')) return '连接被提前关闭。'
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY_LEAF/i.test(code + ' ' + err.message)) return '无法验证服务器证书。'
  if (err.code === 'ETLS' || /TLS|SSL/i.test(code + ' ' + err.message)) return '无法完成 TLS 握手。'
  if (err.code === 'EDNS') return '无法解析服务器地址。'
  return diagnostic(err, google)
}

export async function verify(f: AccountSettings, credential: MailCredential): Promise<Endpoint | void> {
  const client = imapClient(f.imap, credential)
  try {
    const [imap, smtp] = await Promise.allSettled([
      (async () => {
        await client.connect()
        await client.mailboxOpen('INBOX', { readOnly: true })
      })(),
      verifySmtp(f.smtp, credential),
    ])
    if (imap.status === 'rejected' || smtp.status === 'rejected') {
      const incoming = imap.status === 'fulfilled' ? '验证通过' : diagnostic(imap.reason, typeof credential !== 'string')
      const outgoing = smtp.status === 'fulfilled' ? '验证通过' : smtp.reason.message
      throw new Error('收信：' + incoming + '  发信：' + outgoing)
    }
    return smtp.value
  } finally {
    client.close()
  }
}
