import http from 'node:http'
import { shell } from 'electron'
import { maskEmail } from './email-mask'
import {
  buildRedirectUri,
  getAuthorizeUrl,
  getFeedbackUrl,
  getOAuthConfig,
  getRedirectUriHint,
  getRevokeUrl,
  getTokenUrl,
  getUserInfoUrl,
  type OAuthConfig,
} from './oauth-config'
import { createPkcePair, randomUrlSafe } from './pkce'
import {
  clearTokenBundle,
  loadTokenBundle,
  saveTokenBundle,
  type StoredTokenBundle,
} from './token-store'

export interface AuthSessionSnapshot {
  loggedIn: boolean
  loginPending: boolean
  emailMasked: string
  scopes: string[]
  issuer: string
  clientId: string
  redirectUri: string
  expiresAt: string | null
  accessExpiresInSec: number | null
  error: string
}

export interface AuthActionResult {
  ok: boolean
  message: string
  session: AuthSessionSnapshot
  /** 需要先登录（如反馈） */
  needLogin?: boolean
}

type PendingLogin = {
  state: string
  verifier: string
  redirectUri: string
  server: http.Server
  resolve: (result: AuthActionResult) => void
  settled: boolean
}

let loginPending = false
let lastError = ''
let pending: PendingLogin | null = null
let sessionListener: (() => void) | null = null

export function setAuthSessionListener(listener: (() => void) | null): void {
  sessionListener = listener
}

function notifySession(): void {
  try {
    sessionListener?.()
  } catch {
    // ignore
  }
}

export function getAuthSession(): AuthSessionSnapshot {
  const config = getOAuthConfig()
  const bundle = loadTokenBundle()
  const loggedIn = Boolean(bundle?.accessToken)
  const expiresAt = bundle?.expiresAt ?? null
  const accessExpiresInSec =
    expiresAt != null ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : null

  return {
    loggedIn,
    loginPending,
    emailMasked: bundle?.emailMasked || (loggedIn ? '已登录' : ''),
    scopes: parseScopes(bundle?.scope) || [...config.scopes],
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri: pending?.redirectUri || getRedirectUriHint(config),
    expiresAt: expiresAt != null ? new Date(expiresAt).toISOString() : null,
    accessExpiresInSec,
    error: lastError,
  }
}

export async function startLogin(): Promise<AuthActionResult> {
  if (loginPending && pending) {
    return {
      ok: false,
      message: '已有登录流程进行中，请在浏览器中完成授权',
      session: getAuthSession(),
    }
  }

  lastError = ''
  const config = getOAuthConfig()
  const { verifier, challenge } = createPkcePair()
  const state = randomUrlSafe(24)

  try {
    const { server, redirectUri } = await listenLoopback(config)
    loginPending = true
    notifySession()

    const resultPromise = new Promise<AuthActionResult>((resolve) => {
      pending = {
        state,
        verifier,
        redirectUri,
        server,
        resolve,
        settled: false,
      }
    })

    const url = buildAuthorizeUrl(config, {
      redirectUri,
      state,
      challenge,
    })
    await shell.openExternal(url)

    // 超时自动清理（10 分钟）
    const timer = setTimeout(() => {
      settlePending({
        ok: false,
        message: '登录超时，请重试',
        session: getAuthSession(),
      })
    }, 10 * 60_000)

    const result = await resultPromise
    clearTimeout(timer)
    return result
  } catch (err) {
    loginPending = false
    pending = null
    lastError = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      message: lastError,
      session: getAuthSession(),
    }
  }
}

export async function cancelLogin(): Promise<AuthActionResult> {
  settlePending({
    ok: false,
    message: '已取消登录',
    session: getAuthSession(),
  })
  return {
    ok: true,
    message: '已取消登录',
    session: getAuthSession(),
  }
}

export async function logout(): Promise<AuthActionResult> {
  const bundle = loadTokenBundle()
  if (bundle?.accessToken || bundle?.refreshToken) {
    await revokeToken(bundle.refreshToken || bundle.accessToken).catch(() => undefined)
  }
  clearTokenBundle()
  lastError = ''
  return {
    ok: true,
    message: '已退出登录',
    session: getAuthSession(),
  }
}

export async function openFeedback(): Promise<AuthActionResult> {
  const bundle = await ensureFreshTokens()
  if (!bundle?.accessToken || !bundle.email) {
    return {
      ok: false,
      needLogin: true,
      message: '意见反馈需要先登录',
      session: getAuthSession(),
    }
  }

  const config = getOAuthConfig()
  const params = new URLSearchParams({
    client_id: config.clientId,
    email: bundle.email,
  })
  const url = `${getFeedbackUrl(config)}?${params.toString()}`
  await shell.openExternal(url)
  return {
    ok: true,
    message: '已打开意见反馈页',
    session: getAuthSession(),
  }
}

/** 确保 access_token 可用（临近过期则 refresh） */
export async function ensureFreshTokens(): Promise<StoredTokenBundle | null> {
  let bundle = loadTokenBundle()
  if (!bundle?.accessToken) return null

  const skewMs = 60_000
  if (bundle.expiresAt && bundle.expiresAt - Date.now() > skewMs) {
    return bundle
  }
  if (!bundle.refreshToken) return bundle

  try {
    const refreshed = await refreshAccessToken(bundle.refreshToken)
    bundle = {
      ...bundle,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || bundle.refreshToken,
      idToken: refreshed.idToken || bundle.idToken,
      tokenType: refreshed.tokenType || bundle.tokenType,
      scope: refreshed.scope || bundle.scope,
      expiresAt: refreshed.expiresAt,
      obtainedAt: Date.now(),
    }
    saveTokenBundle(bundle)
    return bundle
  } catch {
    return bundle
  }
}

function settlePending(result: AuthActionResult): void {
  const p = pending
  pending = null
  loginPending = false
  if (!p || p.settled) return
  p.settled = true
  try {
    p.server.close()
  } catch {
    // ignore
  }
  if (!result.ok && result.message) {
    lastError = result.message
  }
  notifySession()
  p.resolve({
    ...result,
    session: getAuthSession(),
  })
}

function listenLoopback(
  config: OAuthConfig,
): Promise<{ server: http.Server; port: number; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handleCallbackRequest(req, res)
    })
    const preferred = config.preferredLoopbackPort
    // 0 = 系统分配空闲端口；也可先尝试 preferred
    const listenPort = preferred > 0 ? preferred : 0

    server.once('error', (err) => {
      if (preferred > 0) {
        // 首选端口被占则回退到动态端口
        server.removeAllListeners('error')
        server.once('error', (err2) => {
          reject(
            new Error(
              `无法启动本机回调服务：${err2.message}。可设置 FTCS_OAUTH_LOOPBACK_PORT 指定端口。`,
            ),
          )
        })
        server.listen(0, config.loopbackHost, () => {
          const addr = server.address()
          const port =
            addr && typeof addr === 'object' ? addr.port : 0
          if (!port) {
            reject(new Error('无法解析 loopback 端口'))
            return
          }
          resolve({
            server,
            port,
            redirectUri: buildRedirectUri(port, config),
          })
        })
        return
      }
      reject(
        new Error(
          `无法启动本机回调服务：${err.message}。可设置 FTCS_OAUTH_LOOPBACK_PORT 指定端口。`,
        ),
      )
    })

    server.listen(listenPort, config.loopbackHost, () => {
      const addr = server.address()
      const port = addr && typeof addr === 'object' ? addr.port : 0
      if (!port) {
        reject(new Error('无法解析 loopback 端口'))
        return
      }
      resolve({
        server,
        port,
        redirectUri: buildRedirectUri(port, config),
      })
    })
  })
}

async function handleCallbackRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const p = pending
  if (!p) {
    res.writeHead(404)
    res.end('No pending login')
    return
  }

  const host = req.headers.host || '127.0.0.1'
  const url = new URL(req.url || '/', `http://${host}`)
  if (url.pathname !== getOAuthConfig().redirectPath) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const error = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description') || ''
  if (error) {
    writeCallbackPage(res, false, errorDesc || error)
    settlePending({
      ok: false,
      message: `授权失败：${errorDesc || error}`,
      session: getAuthSession(),
    })
    return
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state || state !== p.state) {
    writeCallbackPage(res, false, '无效的回调参数')
    settlePending({
      ok: false,
      message: 'OAuth 回调无效（state/code）',
      session: getAuthSession(),
    })
    return
  }

  try {
    const tokens = await exchangeCode(code, p.verifier, p.redirectUri)
    const profile = await fetchUserProfile(tokens.accessToken)
    const email = profile.email || ''
    const bundle: StoredTokenBundle = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      expiresAt: tokens.expiresAt,
      email: email || undefined,
      emailMasked: email ? maskEmail(email) : '已登录',
      sub: profile.sub,
      obtainedAt: Date.now(),
    }
    saveTokenBundle(bundle)
    lastError = ''
    writeCallbackPage(res, true, '登录成功，可以返回外贸获客应用。')
    settlePending({
      ok: true,
      message: '登录成功',
      session: getAuthSession(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeCallbackPage(res, false, message)
    settlePending({
      ok: false,
      message,
      session: getAuthSession(),
    })
  }
}

function buildAuthorizeUrl(
  config: OAuthConfig,
  opts: { redirectUri: string; state: string; challenge: string },
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: opts.redirectUri,
    scope: config.scopes.join(' '),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
  })
  return `${getAuthorizeUrl(config)}?${params.toString()}`
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<{
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType?: string
  scope?: string
  expiresAt?: number
}> {
  const config = getOAuthConfig()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  })
  const res = await fetch(getTokenUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      formatOAuthError(data, `换取 token 失败（HTTP ${res.status}）`),
    )
  }
  return parseTokenResponse(data)
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType?: string
  scope?: string
  expiresAt?: number
}> {
  const config = getOAuthConfig()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  })
  const res = await fetch(getTokenUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(formatOAuthError(data, `刷新 token 失败（HTTP ${res.status}）`))
  }
  return parseTokenResponse(data)
}

async function revokeToken(token: string): Promise<void> {
  const config = getOAuthConfig()
  const body = new URLSearchParams({
    token,
    client_id: config.clientId,
  })
  await fetch(getRevokeUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  }).catch(() => undefined)
}

async function fetchUserProfile(
  accessToken: string,
): Promise<{ email?: string; sub?: string }> {
  const res = await fetch(getUserInfoUrl(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    // userinfo 失败时仍可登录，仅无掩码占位
    return {}
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const email =
    typeof data.email === 'string'
      ? data.email
      : typeof data.preferred_username === 'string'
        ? data.preferred_username
        : undefined
  const sub = typeof data.sub === 'string' ? data.sub : undefined
  return { email, sub }
}

function parseTokenResponse(data: Record<string, unknown>): {
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType?: string
  scope?: string
  expiresAt?: number
} {
  const accessToken = String(data.access_token || '')
  if (!accessToken) {
    throw new Error('token 响应缺少 access_token')
  }
  const expiresIn =
    typeof data.expires_in === 'number'
      ? data.expires_in
      : Number(data.expires_in) || 0
  return {
    accessToken,
    refreshToken:
      typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    idToken: typeof data.id_token === 'string' ? data.id_token : undefined,
    tokenType: typeof data.token_type === 'string' ? data.token_type : undefined,
    scope: typeof data.scope === 'string' ? data.scope : undefined,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
  }
}

function parseScopes(scope?: string): string[] {
  if (!scope) return []
  return scope.split(/[\s,+]+/).filter(Boolean)
}

function formatOAuthError(data: Record<string, unknown>, fallback: string): string {
  const err = typeof data.error === 'string' ? data.error : ''
  const desc =
    typeof data.error_description === 'string' ? data.error_description : ''
  if (err && desc) return `${err}: ${desc}`
  if (err) return err
  if (desc) return desc
  return fallback
}

function writeCallbackPage(res: http.ServerResponse, ok: boolean, message: string): void {
  const title = ok ? '登录成功' : '登录失败'
  const color = ok ? '#4ade80' : '#f87171'
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · 外贸获客</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#141414; color:#e4e4e4;
      display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { max-width:420px; padding:28px 32px; border:1px solid #2b2b2b; border-radius:12px;
      background:#1e1e1e; text-align:center; }
    h1 { font-size:18px; margin:0 0 12px; color:${color}; }
    p { margin:0; font-size:13px; color:#a0a0a0; line-height:1.5; white-space:pre-wrap; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
  res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
