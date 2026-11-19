import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
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
export async function verify(f: Connection) {
  const client = imapClient(f.imap, f.password)
  const smtp = nodemailer.createTransport({
    host: f.smtp.host,
    port: f.smtp.port,
    secure: f.smtp.security === 'tls',
    forceAuth: true,
    requireTLS: f.smtp.security === 'starttls',
    auth: { user: f.smtp.username, pass: f.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  })
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
