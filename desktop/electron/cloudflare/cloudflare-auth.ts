import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

interface Credentials { accessToken: string; refreshToken?: string; expiresAt?: number; accountId?: string }
export interface CloudflareAccount { id: string; name: string }
export interface CloudflareState { connected: boolean; authorized?: boolean; pending?: boolean; accountId?: string; accountName?: string; accounts?: CloudflareAccount[]; message?: string }
export interface CloudflareAction extends CloudflareState { ok: boolean; needsPageAuthorization?: boolean }
const CLIENT_ID = '1a2011f887b64896fbfdbef7591dc8ec'
const REDIRECT_URI = 'http://127.0.0.1:43862/callback'
const storePath = () => path.join(app.getPath('userData'), 'cloudflare-authorization.bin')
const getClientId = () => process.env.FTCS_CLOUDFLARE_CLIENT_ID?.trim() || CLIENT_ID
const BASE_SCOPES = 'account-settings.read user-details.read offline_access'
let discoveredScopes = ''
const getScopes = () => process.env.FTCS_CLOUDFLARE_SCOPES?.trim() || discoveredScopes || BASE_SCOPES
let generation = 0
let pending: { server: http.Server; state: string; verifier: string; resolve: (result: CloudflareAction) => void; timer: ReturnType<typeof setTimeout>; processing: boolean } | null = null
let tokenPromise: Promise<Credentials | null> | null = null

function load(): Credentials | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(storePath()))) as Credentials
    return typeof data.accessToken === 'string' && data.accessToken ? data : null
  } catch { return null }
}
function save(credentials: Credentials): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密不可用。')
  const file = storePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(credentials)), { mode: 0o600 })
}
function tokenRequest(values: Record<string, string>): Promise<Record<string, unknown>> {
  return fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values), signal: AbortSignal.timeout(15000), redirect: 'error',
  }).then(async response => {
    if (!response.ok) throw new Error(`Cloudflare 授权服务返回 HTTP ${response.status}。`)
    return await response.json() as Record<string, unknown>
  })
}
function credentialsFrom(data: Record<string, unknown>, old?: Credentials): Credentials {
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Cloudflare 没有返回有效的访问令牌。')
  return { accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : old?.refreshToken,
    expiresAt: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined,
    accountId: old?.accountId }
}
async function validToken(): Promise<Credentials | null> {
  const stored = load()
  if (!stored) return null
  if (!stored.expiresAt || stored.expiresAt > Date.now() + 60000) return stored
  if (!stored.refreshToken) throw new Error('Cloudflare 授权已过期，请重新连接。')
  const current = generation
  const result = await tokenRequest({ grant_type: 'refresh_token', client_id: getClientId(), refresh_token: stored.refreshToken })
  const updated = credentialsFrom(result, stored)
  if (current !== generation) return null
  save(updated)
  return updated
}
function getValidToken(): Promise<Credentials | null> {
  if (!tokenPromise) tokenPromise = validToken().finally(() => { tokenPromise = null })
  return tokenPromise
}
async function api(token: string, suffix: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${suffix}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (response.status === 401 || response.status === 403) throw new Error('Cloudflare 授权无效或缺少所需权限。')
  if (!response.ok) throw new Error(`Cloudflare 查询失败（HTTP ${response.status}）。`)
  const data = await response.json() as Record<string, unknown>
  if (data.success !== true || !Array.isArray(data.result)) throw new Error('Cloudflare 返回的数据无效。')
  return data
}
async function discoverPageScopes(token: string): Promise<string> {
  const data = await api(token, '/oauth/scopes')
  const records = data.result as Array<{ id?: unknown; name?: unknown }>
  const find = (kind: string) => records.find(item => typeof item.name === 'string' && new RegExp(`^(?:cloudflare )?pages ${kind}$`, 'i').test(item.name) && typeof item.id === 'string')?.id
  const read = find('read')
  const write = find('write')
  if (typeof read !== 'string' || typeof write !== 'string' || !/^[a-z0-9._-]+$/i.test(read) || !/^[a-z0-9._-]+$/i.test(write)) throw new Error('无法确定 Cloudflare Pages 权限标识，请检查 OAuth 客户端配置。')
  return `${BASE_SCOPES} ${read} ${write}`
}
async function listAccounts(token: string): Promise<CloudflareAccount[]> {
  const accounts: CloudflareAccount[] = []
  for (let page = 1; page <= 20; page++) {
    const data = await api(token, `/accounts?per_page=50&page=${page}`)
    const records = data.result as Array<{ id?: unknown; name?: unknown }>
    for (const record of records) if (typeof record.id === 'string' && /^[a-f0-9]{32}$/i.test(record.id) && typeof record.name === 'string') accounts.push({ id: record.id, name: record.name })
    const info = data.result_info as { total_pages?: unknown } | undefined
    if (typeof info?.total_pages !== 'number' || page >= info.total_pages) break
    if (page === 20) throw new Error('Cloudflare 账号数量过多，请联系支持。')
  }
  return accounts
}
async function inspect(credentials: Credentials, current: number): Promise<CloudflareState> {
  const accounts = await listAccounts(credentials.accessToken)
  if (current !== generation) return { connected: false }
  if (!accounts.length) return { connected: false, authorized: true, accounts: [], message: '未找到已授权的 Cloudflare 账号，请检查授权范围。' }
  const account = accounts.find(a => a.id === credentials.accountId) || (accounts.length === 1 ? accounts[0] : undefined)
  if (!account) return { connected: false, authorized: true, accounts, message: '请选择用于独立站的 Cloudflare 账号。' }
  await api(credentials.accessToken, `/accounts/${account.id}/pages/projects?per_page=1`)
  if (current !== generation) return { connected: false }
  if (credentials.accountId !== account.id) { credentials.accountId = account.id; save(credentials) }
  return { connected: true, authorized: true, accountId: account.id, accountName: account.name, accounts }
}
export async function getCloudflareState(): Promise<CloudflareState> {
  const current = generation
  try {
    const credentials = await getValidToken()
    if (current !== generation || !credentials) return { connected: false, pending: !!pending }
    return await inspect(credentials, current)
  } catch (error) { return { connected: false, authorized: !!load(), message: error instanceof Error ? error.message : '无法检查 Cloudflare 连接。' } }
}
function finish(result: CloudflareAction): void {
  const p = pending
  if (!p) return
  pending = null
  clearTimeout(p.timer)
  p.server.close(() => p.resolve(result))
  p.server.closeIdleConnections()
}
function callback(req: http.IncomingMessage, res: http.ServerResponse): void {
  const p = pending
  if (!p || req.method !== 'GET') { res.writeHead(404); res.end(); return }
  let url: URL
  try { url = new URL(req.url || '', REDIRECT_URI) } catch { res.writeHead(400); res.end(); return }
  if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return }
  if (url.searchParams.get('state') !== p.state) { res.writeHead(400); res.end('Invalid state'); return }
  if (p.processing) { res.writeHead(409); res.end(); return }
  const code = url.searchParams.get('code')
  if (!code) {
    const error = url.searchParams.get('error')
    const message = error === 'invalid_scope' ? 'Cloudflare 权限范围与客户端配置不匹配，请检查已选权限。' : error === 'access_denied' ? 'Cloudflare 授权被拒绝。' : 'Cloudflare 授权未完成。'
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('授权未完成，请返回 FTCS。')
    finish({ ok: false, connected: false, message }); return
  }
  p.processing = true
  const current = generation
  void (async () => {
    try {
      const result = await tokenRequest({ grant_type: 'authorization_code', client_id: getClientId(), code, redirect_uri: REDIRECT_URI, code_verifier: p.verifier })
      if (current !== generation || pending !== p) { res.writeHead(410); res.end(); return }
      const credentials = credentialsFrom(result)
      if (!process.env.FTCS_CLOUDFLARE_SCOPES?.trim() && !discoveredScopes) {
        discoveredScopes = await discoverPageScopes(credentials.accessToken)
        if (current !== generation || pending !== p) { res.writeHead(410); res.end(); return }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end('账号授权完成，请返回 FTCS 继续确认 Pages 权限。')
        finish({ ok: true, connected: false, needsPageAuthorization: true, message: '请继续确认 Cloudflare Pages 权限。' })
        return
      }
      save(credentials)
      const state = await inspect(credentials, current)
      if (current !== generation || pending !== p) { res.writeHead(410); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      res.end('授权完成，请返回 FTCS。')
      finish({ ok: true, ...state })
    } catch (error) {
      if (current !== generation || pending !== p) { res.writeHead(410); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('授权处理失败，请返回 FTCS。')
      finish({ ok: false, connected: false, message: error instanceof Error ? error.message : 'Cloudflare 授权失败。' })
    }
  })()
}
export async function connectCloudflare(): Promise<CloudflareAction> {
  if (pending) return { ok: false, connected: false, pending: true, message: 'Cloudflare 授权正在进行。' }
  if (!getScopes()) return { ok: false, connected: false, message: '尚未配置 Cloudflare OAuth 权限范围。' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, connected: false, message: '系统凭据加密不可用。' }
  const current = ++generation
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(32).toString('base64url')
  const server = http.createServer(callback)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(43862, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
  } catch { server.close(); return { ok: false, connected: false, message: '无法启动本机授权回调，请检查 43862 端口是否被占用。' } }
  if (current !== generation) { server.close(); return { ok: false, connected: false, message: '授权已取消。' } }
  const result = new Promise<CloudflareAction>(resolve => {
    const timer = setTimeout(() => finish({ ok: false, connected: false, message: 'Cloudflare 授权超时，请重试。' }), 5 * 60 * 1000)
    pending = { server, state, verifier, resolve, timer, processing: false }
  })
  const url = new URL('https://dash.cloudflare.com/oauth2/auth')
  url.search = new URLSearchParams({ client_id: getClientId(), redirect_uri: REDIRECT_URI, response_type: 'code', scope: getScopes(), state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
  try { await shell.openExternal(url.toString()) }
  catch { finish({ ok: false, connected: false, message: '无法打开浏览器，请重试。' }) }
  return result
}
export async function selectCloudflareAccount(accountId: unknown): Promise<CloudflareAction> {
  const current = generation
  try {
    const credentials = await getValidToken()
    if (!credentials || typeof accountId !== 'string') return { ok: false, connected: false, message: '请先连接 Cloudflare。' }
    const accounts = await listAccounts(credentials.accessToken)
    if (!accounts.some(account => account.id === accountId)) return { ok: false, connected: false, message: '所选账号不在授权范围中。' }
    await api(credentials.accessToken, `/accounts/${accountId}/pages/projects?per_page=1`)
    if (current !== generation) return { ok: false, connected: false, message: '连接已取消。' }
    credentials.accountId = accountId
    save(credentials)
    return { ok: true, connected: true, authorized: true, accountId, accountName: accounts.find(a => a.id === accountId)?.name, accounts }
  } catch (error) { return { ok: false, connected: false, message: error instanceof Error ? error.message : 'Cloudflare 账号选择失败。' } }
}
export function cancelCloudflareAuth(): void { generation++; finish({ ok: false, connected: false, message: '已取消 Cloudflare 授权。' }) }
export function disconnectCloudflare(): void {
  discoveredScopes = ''
  cancelCloudflareAuth()
  try { fs.unlinkSync(storePath()) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
