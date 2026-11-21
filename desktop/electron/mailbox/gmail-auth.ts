import http from 'node:http'
import { createPkcePair, randomUrlSafe } from '../auth/pkce'
import type { AccountSettings } from './types'

const clientId = '661611135239-v37p7n0dcuvi5tembv0rhqqa6uv50u2l.apps.googleusercontent.com'
const mailScope = 'https://mail.google.com/'
declare const __FTCS_GMAIL_CLIENT_SECRET__: string
export interface GmailTokens { accessToken: string; refreshToken: string; expiresAt: number }

export function gmailSettings(email: string): AccountSettings {
  return {
    email,
    imap: { host: 'imap.gmail.com', port: 993, security: 'tls', username: email },
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'tls', username: email },
  }
}

async function requestTokens(fields: Record<string, string>, signal: AbortSignal, previous?: GmailTokens): Promise<GmailTokens> {
  const body = new URLSearchParams({ client_id: clientId, ...fields })
  const secret = process.env.FTCS_GMAIL_CLIENT_SECRET ||
    (typeof __FTCS_GMAIL_CLIENT_SECRET__ === 'string' ? __FTCS_GMAIL_CLIENT_SECRET__ : '')
  if (secret) body.set('client_secret', secret)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  })
  const data = await response.json()
  if (!response.ok) {
    if (data.error === 'invalid_grant') throw Object.assign(new Error('Google 授权已失效，请重新连接 Gmail。'), { code: 'GMAIL_REAUTH' })
    if (data.error === 'invalid_client' || (!secret && data.error === 'invalid_request'))
      throw new Error('Google 未接受桌面客户端配置，请检查 FTCS_GMAIL_CLIENT_SECRET。')
    throw new Error('Google 令牌请求失败（HTTP ' + response.status + '）。')
  }
  const refreshToken = data.refresh_token || previous?.refreshToken
  if (typeof refreshToken !== 'string' || !refreshToken || typeof data.access_token !== 'string' ||
      !data.access_token || !(Number.isFinite(data.expires_in) && data.expires_in > 0))
    throw new Error('Google 未返回可用于后台同步的授权，请重新连接 Gmail。')
  if (data.scope && !String(data.scope).split(/\s+/).includes(mailScope))
    throw new Error('请在 Google 授权页允许 FTCS 访问邮箱。')
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 }
}

export function refreshGmail(tokens: GmailTokens, signal: AbortSignal) {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, signal, tokens)
}

export async function authorizeGmail(open: (url: string) => Promise<void>, signal: AbortSignal, hint?: string) {
  const state = randomUrlSafe(24)
  const { verifier, challenge } = createPkcePair()
  signal.throwIfAborted()
  const callback = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let redirectUri = ''
    let used = false
    const server = http.createServer((req, res) => {
      const url = new URL('http://127.0.0.1' + (req.url?.startsWith('/') ? req.url : '/invalid'))
      if (used || req.method !== 'GET' || req.headers.host !== new URL(redirectUri).host ||
          url.pathname !== '/' || url.searchParams.get('state') !== state) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const ok = !!code && !url.searchParams.has('error')
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end('<!doctype html><meta charset="utf-8"><title>FTCS · Gmail</title><style>html{color-scheme:light dark}body{display:grid;place-items:center;min-height:90vh;font:16px system-ui}main{max-width:28rem;padding:2rem;border:1px solid #8886;border-radius:12px}</style><main><h1>FTCS · Gmail</h1><p>' +
        (ok ? '已收到 Google 授权，请返回 FTCS 查看邮箱连接结果。' : '未获得 Google 授权，可以返回 FTCS 重试。') + '</p></main>')
      used = true
      cleanup()
      if (ok) resolve({ code, redirectUri })
      else reject(new Error('未获得 Google 授权，请检查账号权限或重新连接。'))
    })
    const fail = (error: Error) => { cleanup(); reject(error) }
    const abort = () => fail(new Error('Gmail 连接已取消。'))
    const timer = setTimeout(() => fail(new Error('Google 授权等待超时，请重新连接。')), 5 * 60_000)
    function cleanup() {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      server.close()
    }
    signal.addEventListener('abort', abort, { once: true })
    server.once('error', fail)
    server.listen({ host: '127.0.0.1', port: 0, signal }, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return fail(new Error('无法启动 Gmail 本机授权回调。'))
      redirectUri = 'http://127.0.0.1:' + addr.port + '/'
      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email ' + mailScope,
        state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account',
      })
      if (hint) params.set('login_hint', hint)
      void open('https://accounts.google.com/o/oauth2/v2/auth?' + params).catch(fail)
    })
  })
  const tokens = await requestTokens({ grant_type: 'authorization_code', code: callback.code,
    redirect_uri: callback.redirectUri, code_verifier: verifier }, signal)
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + tokens.accessToken }, redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  })
  if (!response.ok) throw new Error('无法从 Google 确认邮箱地址，请重新连接。')
  const user = await response.json()
  if (user.email_verified !== true || typeof user.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(user.email))
    throw new Error('Google 未返回已验证的邮箱地址。')
  return { settings: gmailSettings(user.email), tokens }
}
