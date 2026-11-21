import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import type { SubmitMail } from './composer-store'
import { outgoingMessage } from './outgoing-message'

const apiRoot = 'https://gmail.googleapis.com/gmail/v1/users/me'
const upload = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send'
const maxMimeBytes = 35 * 1024 * 1024
type Request = (url: string, init: RequestInit) => Promise<Response>

// Electron uses the desktop session's proxy configuration for these HTTPS requests.
const desktopRequest: Request = async (url, init) => (await import('electron')).net.fetch(url, init)

async function gmailError(response: Response) {
  if (response.status === 401) return 'Google 授权已失效，请重新连接 Gmail。'
  if (response.status === 403) {
    const data = await response.json().catch(() => null)
    if (data?.error?.details?.some((entry: { reason?: string }) => entry.reason === 'SERVICE_DISABLED') ||
        data?.error?.errors?.some((entry: { reason?: string }) => entry.reason === 'accessNotConfigured'))
      return 'FTCS 的 Google Cloud 项目尚未启用 Gmail API，请联系维护者。'
    return 'Gmail 拒绝访问（HTTP 403），请检查账号授权、组织策略及发送配额。'
  }
  if (response.status === 429) return 'Gmail 请求过于频繁或已达发送限额，请稍后重试。'
  return 'Gmail API 请求失败（HTTP ' + response.status + '）。'
}

async function readGmail(path: string, token: string, signal: AbortSignal | undefined, request: Request) {
  const timeout = AbortSignal.timeout(20000)
  let response: Response
  try {
    response = await request(apiRoot + path, {
      headers: { Authorization: 'Bearer ' + token }, credentials: 'omit', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch {
    throw new Error('无法通过 HTTPS 连接 Gmail API，请检查网络或系统代理。')
  }
  if (!response.ok) throw new Error(await gmailError(response))
  return response.json()
}

export async function verifyGmailApi(email: string, token: string, signal?: AbortSignal, request = desktopRequest) {
  const profile = await readGmail('/profile?fields=emailAddress', token, signal, request)
  if (typeof profile.emailAddress !== 'string' || profile.emailAddress.toLowerCase() !== email.toLowerCase())
    throw new Error('Gmail API 返回的邮箱与当前账号不一致。')
}

async function replyThread(parent: string, token: string, signal: AbortSignal, request: Request) {
  const query = new URLSearchParams({
    q: 'rfc822msgid:' + parent, maxResults: '2', includeSpamTrash: 'true', fields: 'messages(threadId),nextPageToken',
  })
  const result = await readGmail('/messages?' + query, token, signal, request)
  const threads = new Set<string>(result.messages?.map((row: { threadId: string }) => row.threadId))
  if (!result.nextPageToken && threads.size === 1) return [...threads][0]
}

export function gmailSubmit(token: string, signal: AbortSignal, request = desktopRequest): SubmitMail {
  return async (attempt, files) => {
    let submitted = false
    try {
      signal.throwIfAborted()
      const thread = attempt.in_reply_to ? await replyThread(attempt.in_reply_to, token, signal, request) : undefined
      const composer = nodemailer.createTransport({ streamTransport: true, newline: 'windows' })
      const info = await composer.sendMail(outgoingMessage(attempt, files, signal))
      const parts: Uint8Array[] = []
      let length = 0
      for await (const chunk of info.message) {
        signal.throwIfAborted()
        length += chunk.length
        if (length > maxMimeBytes) return { state: 'failed', detail: '编码后的邮件超过 Gmail 的 35 MiB 限制，请减小附件。' }
        parts.push(chunk)
      }
      let type = 'message/rfc822'
      if (thread) {
        const boundary = 'ftcs-' + randomUUID()
        type = 'multipart/related; boundary=' + boundary
        parts.unshift(Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify({ threadId: thread }) + '\r\n--' + boundary + '\r\nContent-Type: message/rfc822\r\n\r\n'))
        parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'))
      }
      const body = Buffer.concat(parts)
      signal.throwIfAborted()
      submitted = true
      const response = await request(upload + '?uploadType=' + (thread ? 'multipart' : 'media'), {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': type },
        body, credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      })
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408)
          return { state: 'failed', detail: await gmailError(response) }
        throw new Error()
      }
      const receipt = await response.json()
      if (typeof receipt?.id !== 'string' || !receipt.id) throw new Error()
      return { state: 'accepted', accepted: info.envelope.to, rejected: [] }
    } catch (err) {
      if (submitted) return { state: 'unknown', detail: '未取得 Gmail 发信回执，请检查已发送邮件。' }
      return { state: 'failed', detail: err instanceof Error ? err.message : '无法准备 Gmail 邮件。' }
    }
  }
}
