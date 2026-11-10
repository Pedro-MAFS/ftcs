import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

interface Tokens { accessToken: string; refreshToken?: string; expiresAt?: number; login: string }
interface Pending { deviceCode: string; expiresAt: number; interval: number; nextPollAt: number; clientId: string }
export type GithubState = { connected: boolean; authorized?: boolean; login?: string; message?: string; installUrl?: string }
export type GithubStart = { ok: boolean; message?: string; userCode?: string; verificationUrl?: string; interval?: number }
export type GithubPoll = { status: 'pending' | 'connected' | 'failed'; interval?: number; message?: string; login?: string }
let pending: Pending | null = null
let generation = 0
let polling = false
let statePromise: Promise<GithubState> | null = null
const tokenPath = () => path.join(app.getPath('userData'), 'github-authorization.bin')
const DEFAULT_GITHUB_CLIENT_ID = 'Iv23liEZ4BHwJfmqOrpM'
const DEFAULT_GITHUB_APP_SLUG = 'ftcs-foreign-trade-ai-agent'
const clientId = () => process.env.FTCS_GITHUB_CLIENT_ID?.trim() || DEFAULT_GITHUB_CLIENT_ID

function readTokens(): Tokens | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenPath()))) as Tokens
    return value.accessToken && value.login ? value : null
  } catch { return null }
}
function saveTokens(tokens: Tokens): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密不可用，无法保存 GitHub 授权')
  fs.mkdirSync(path.dirname(tokenPath()), { recursive: true })
  fs.writeFileSync(tokenPath(), safeStorage.encryptString(JSON.stringify(tokens)))
}
async function post(endpoint: string, data: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`https://github.com/${endpoint}`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(data), signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (!response.ok) throw new Error(`GitHub 授权服务返回 ${response.status}`)
  return await response.json() as Record<string, unknown>
}
async function user(token: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'FTCS-Desktop', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (!response.ok) throw new Error(`GitHub 用户信息读取失败 (${response.status})`)
  const data = await response.json() as { login?: unknown }
  if (typeof data.login !== 'string' || !data.login) throw new Error('GitHub 未返回用户名')
  return data.login
}
async function installationState(token: string, login: string): Promise<GithubState> {
  const response = await fetch('https://api.github.com/user/installations?per_page=1', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'FTCS-Desktop', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (!response.ok) return { connected: false, authorized: true, login, message: '已授权账号，但无法检查 GitHub App 安装状态。' }
  const data = await response.json() as { total_count?: unknown }
  if (typeof data.total_count !== 'number') return { connected: false, authorized: true, login, message: '无法确认 GitHub App 安装状态。' }
  if (data.total_count > 0) return { connected: true, authorized: true, login }
  const slug = process.env.FTCS_GITHUB_APP_SLUG?.trim() || DEFAULT_GITHUB_APP_SLUG
  return { connected: false, authorized: true, login,
    message: 'GitHub 账号已授权，请安装 FTCS GitHub App 并选择要访问的仓库，然后点击刷新。',
    ...(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? { installUrl: `https://github.com/apps/${slug}/installations/new` } : {}) }
}
export function getGithubState(): Promise<GithubState> {
  if (!statePromise) statePromise = checkGithubState().finally(() => { statePromise = null })
  return statePromise
}
async function checkGithubState(): Promise<GithubState> {
  const current = generation
  const saved = readTokens()
  if (!saved) return { connected: false }
  try {
    if (saved.expiresAt && saved.expiresAt <= Date.now() + 60000) {
      if (!saved.refreshToken || !clientId()) return { connected: false, message: 'GitHub 授权已过期，请重新连接' }
      const result = await post('login/oauth/access_token', { client_id: clientId(), grant_type: 'refresh_token', refresh_token: saved.refreshToken })
      if (typeof result.access_token !== 'string') return { connected: false, message: 'GitHub 授权已过期，请重新连接' }
      const updated: Tokens = { accessToken: result.access_token, login: saved.login,
        refreshToken: typeof result.refresh_token === 'string' ? result.refresh_token : undefined,
        expiresAt: typeof result.expires_in === 'number' ? Date.now() + result.expires_in * 1000 : undefined }
      if (current !== generation) return { connected: false }
      saveTokens(updated)
      updated.login = await user(updated.accessToken)
      const state = await installationState(updated.accessToken, updated.login)
      return current === generation ? state : { connected: false }
    }
    const login = await user(saved.accessToken)
    if (current !== generation) return { connected: false }
    const state = await installationState(saved.accessToken, login)
    return current === generation ? state : { connected: false }
  } catch (error) {
    return { connected: false, message: error instanceof Error ? error.message : '无法检查 GitHub 连接' }
  }
}
export async function startGithubAuth(): Promise<GithubStart> {
  const id = clientId()
  if (!id) return { ok: false, message: '尚未配置 GitHub 应用客户端 ID，请先配置 FTCS_GITHUB_CLIENT_ID。' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: '系统凭据加密不可用，无法安全保存 GitHub 授权。' }
  const current = ++generation
  pending = null
  try {
    const data = await post('login/device/code', { client_id: id })
    if (current !== generation) return { ok: false, message: '授权已取消' }
    if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string' || typeof data.expires_in !== 'number') throw new Error('GitHub 未返回有效的设备授权信息')
    const interval = Math.max(5, typeof data.interval === 'number' ? data.interval : 5)
    pending = { deviceCode: data.device_code, clientId: id, expiresAt: Date.now() + data.expires_in * 1000, interval, nextPollAt: Date.now() + interval * 1000 }
    return { ok: true, userCode: data.user_code, verificationUrl: 'https://github.com/login/device', interval }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'GitHub 授权启动失败' } }
}
export async function pollGithubAuth(): Promise<GithubPoll> {
  const p = pending
  if (!p) return { status: 'failed', message: '授权已取消或过期，请重新连接' }
  if (p.expiresAt <= Date.now()) { pending = null; return { status: 'failed', message: '授权码已过期，请重新连接' } }
  if (polling || Date.now() < p.nextPollAt) return { status: 'pending', interval: p.interval }
  polling = true
  p.nextPollAt = Date.now() + p.interval * 1000
  const current = generation
  try {
    const data = await post('login/oauth/access_token', { client_id: p.clientId, device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
    if (current !== generation || pending !== p) return { status: 'failed', message: '授权已取消' }
    if (data.error === 'authorization_pending') return { status: 'pending', interval: p.interval }
    if (data.error === 'slow_down') { p.interval += 5; p.nextPollAt = Date.now() + p.interval * 1000; return { status: 'pending', interval: p.interval } }
    if (typeof data.access_token !== 'string') { pending = null; return { status: 'failed', message: data.error === 'access_denied' ? 'GitHub 授权被拒绝' : 'GitHub 授权未完成，请重试' } }
    const login = await user(data.access_token)
    if (current !== generation || pending !== p) return { status: 'failed', message: '授权已取消' }
    saveTokens({ accessToken: data.access_token, login,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      expiresAt: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined })
    pending = null
    return { status: 'connected', login }
  } catch (error) { return { status: 'failed', message: error instanceof Error ? error.message : 'GitHub 授权失败' } }
  finally { polling = false }
}
export function cancelGithubAuth(): void { generation++; pending = null }
export function disconnectGithub(): void { cancelGithubAuth(); try { fs.unlinkSync(tokenPath()) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
