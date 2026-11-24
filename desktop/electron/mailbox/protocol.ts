import { outgoingMessage } from './outgoing-message'
import { verifyGmailApi } from './gmail-api'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { SubmitMail } from './composer-store'
import type { Endpoint, AccountSettings } from './types'

export type MailCredential = string | { accessToken: string }

/** 网易在登录后仍要求 ID，否则文件夹打开了也不给 UIDNEXT。 */
export function netEaseImap(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/\.+$/, '')
  return ['163.com', '126.com', 'yeah.net', '188.com'].some(
    (suffix) => name === suffix || name.endsWith('.' + suffix),
  )
}

const netEaseClientInfo = {
  name: 'FTCS',
  version: '1.0',
  vendor: 'FTCS',
  'support-email': 'mfs1998@qq.com',
}

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
    ...(netEaseImap(e.host) ? { clientInfo: netEaseClientInfo } : {}),
  })
  client.on('error', () => {
    /* Pending protocol operations reject on disconnect. */
  })
  return client
}

/** 登录后再发一次 ID。登录前的 ID 对网易不算数。 */
export async function connectImap(client: ImapFlow, host: string): Promise<void> {
  await client.connect()
  if (!netEaseImap(host)) return
  client.capabilities.set('ID', true)
  await (
    client as ImapFlow & { run(command: string, info: ImapFlow['clientInfo']): Promise<unknown> }
  ).run('ID', client.clientInfo)
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
    return google ? 'Google 邮箱认证失败，请重新连接 Gmail 并确认账号允许邮件客户端访问。' : '认证失败，请检查登录名、密码（或授权码）及邮箱协议开关。'
  if (/tls|cert|ssl|starttls/i.test((code ?? '') + ' ' + message))
    return 'TLS 验证失败，请检查主机、端口与加密方式。'
  if (code === 'ENOSPC' || code === 'EACCES' || code === 'EPERM')
    return '无法写入本地邮箱，请检查磁盘空间及权限。'
  if (message === '邮件服务器未返回文件夹范围。') return message
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
      const info = await smtp.sendMail(outgoingMessage(a, attachments, signal))
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
async function probeSmtp(endpoint: Endpoint, credential: string) {
  const transport = smtpClient(endpoint, credential)
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}

export async function verifySmtp(endpoint: Endpoint, password: string, probe = probeSmtp) {
  try {
    await probe(endpoint, password)
  } catch (error) {
    const err = error as { code?: string; originalCode?: string; timeoutType?: string; command?: string; message?: string }
    const code = err.originalCode || err.code || ''
    const detail = err.command?.startsWith('AUTH') ? diagnostic({ code: 'EAUTH' }) : smtpConnectionDetail(err)
    const label = endpoint.security === 'tls' ? 'TLS' : 'STARTTLS'
    const suffix = /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? ' (' + code + ')' : ''
    throw new Error(endpoint.host + ':' + endpoint.port + ' ' + label + ' — ' + detail + suffix)
  }
}

function smtpConnectionDetail(err: { code?: string; originalCode?: string; timeoutType?: string; message?: string }) {
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
  return diagnostic(err)
}

export async function verify(f: AccountSettings, credential: MailCredential, signal?: AbortSignal) {
  const client = imapClient(f.imap, credential)
  try {
    const [imap, outbound] = await Promise.allSettled([
      (async () => {
        await connectImap(client, f.imap.host)
        await client.mailboxOpen('INBOX', { readOnly: true })
      })(),
      typeof credential === 'string' ? verifySmtp(f.smtp, credential) : verifyGmailApi(f.email, credential.accessToken, signal),
    ])
    if (imap.status === 'rejected' || outbound.status === 'rejected') {
      const incoming = imap.status === 'fulfilled' ? '验证通过' : diagnostic(imap.reason, typeof credential !== 'string')
      const outgoing = outbound.status === 'fulfilled' ? '验证通过' : outbound.reason.message
      throw new Error('收信：' + incoming + '  发信：' + outgoing)
    }
  } finally {
    client.close()
  }
}
