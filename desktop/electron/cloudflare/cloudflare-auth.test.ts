import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-cloudflare-test-'))
process.env.FTCS_CF_TEST_DIR = dir
process.env.FTCS_CLOUDFLARE_SCOPES = 'account-settings.read pages.write offline_access'
const electron = `export const app={getPath(){return process.env.FTCS_CF_TEST_DIR}};export const safeStorage={isEncryptionAvailable(){return true},encryptString(s){return Buffer.from('encrypted:'+s)},decryptString(b){return b.toString().slice(10)}};export const shell={async openExternal(url){globalThis.__ftcsTestUrl=url}};`
registerHooks({ resolve(specifier, context, next) { return specifier === 'electron' ? { url: `data:text/javascript,${encodeURIComponent(electron)}`, shortCircuit: true } : next(specifier, context) } })
const { connectCloudflare, getCloudflareState, selectCloudflareAccount, cancelCloudflareAuth, disconnectCloudflare } = await import('./cloudflare-auth.ts')
const originalFetch = globalThis.fetch
const accountId = '1234567890abcdef1234567890abcdef'
const account2 = '1234567890abcdef1234567890abcdee'
let opened = ''
let multi = false
let tokenBody = ''
let refreshCalls = 0
let expiresIn = 3600
Object.defineProperty(globalThis, '__ftcsTestUrl', { configurable: true, set(value: string) { opened = value } })
globalThis.fetch = async (input, init) => {
  const url = String(input)
  if (url === 'https://dash.cloudflare.com/oauth2/token') {
    tokenBody = String(init?.body)
    if (new URLSearchParams(tokenBody).get('grant_type') === 'refresh_token') { refreshCalls++; return Response.json({ access_token: 'refreshed-token', refresh_token: 'rotated-refresh', expires_in: 3600 }) }
    return Response.json({ access_token: 'test-token', refresh_token: 'test-refresh', expires_in: expiresIn })
  }
  if (url === 'https://api.cloudflare.com/client/v4/oauth/scopes') return Response.json({ success: true, result: [{ id: 'site.read', name: 'Pages Read' }, { id: 'site.write', name: 'Pages Write' }] })
  if (url.startsWith('https://api.cloudflare.com/client/v4/accounts?')) return Response.json({ success: true, result: [{ id: accountId, name: '测试账号' }, ...(multi ? [{ id: account2, name: '第二账号' }] : [])], result_info: { total_pages: 1 } })
  if (url.includes('/pages/projects?')) return Response.json({ success: true, result: [] })
  throw new Error('unexpected URL')
}
function request(url: string): Promise<number> {
  return new Promise((resolve, reject) => { http.get(url, res => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)) }).on('error', reject) })
}
async function start() {
  opened = ''
  const result = connectCloudflare()
  for (let i = 0; i < 100 && !opened; i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(opened, 'browser opened')
  return { result, url: new URL(opened) }
}

test('OAuth PKCE checks state, connects account and persists credentials', async () => {
  const { result, url } = await start()
  assert.equal(url.origin, 'https://dash.cloudflare.com')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:43862/callback')
  assert.equal(await request('http://127.0.0.1:43862/callback?code=bad&state=wrong'), 400)
  assert.equal(await request(`http://127.0.0.1:43862/callback?code=example&state=${url.searchParams.get('state')}`), 200)
  const connected = await result
  assert.equal(connected.connected, true)
  assert.equal(connected.accountId, accountId)
  assert.equal(new URLSearchParams(tokenBody).get('grant_type'), 'authorization_code')
  assert.ok(new URLSearchParams(tokenBody).get('code_verifier'))
  assert.equal(JSON.stringify(connected).includes('test-token'), false)
  assert.equal((await getCloudflareState()).connected, true)
  disconnectCloudflare()
  assert.equal(fs.existsSync(path.join(dir, 'cloudflare-authorization.bin')), false)
})

test('discovers provider scope IDs before requesting Pages authorization', async () => {
  delete process.env.FTCS_CLOUDFLARE_SCOPES
  let round = await start()
  assert.equal(round.url.searchParams.get('scope'), 'account-settings.read user-details.read offline_access')
  assert.equal(await request(`http://127.0.0.1:43862/callback?code=first&state=${round.url.searchParams.get('state')}`), 200)
  assert.equal((await round.result).needsPageAuthorization, true)
  round = await start()
  assert.match(round.url.searchParams.get('scope') ?? '', /site.read site.write/)
  assert.equal(await request(`http://127.0.0.1:43862/callback?code=second&state=${round.url.searchParams.get('state')}`), 200)
  assert.equal((await round.result).connected, true)
  disconnectCloudflare()
  process.env.FTCS_CLOUDFLARE_SCOPES = 'account-settings.read pages.write offline_access'
})

test('reports a provider scope mismatch without exposing callback values', async () => {
  const { result, url } = await start()
  assert.equal(await request(`http://127.0.0.1:43862/callback?error=invalid_scope&state=${url.searchParams.get('state')}`), 200)
  const value = await result
  assert.equal(value.ok, false)
  assert.match(value.message ?? '', /权限范围/)
})

test('requires user selection when multiple accounts are authorized', async () => {
  multi = true
  const { result, url } = await start()
  assert.equal(await request(`http://127.0.0.1:43862/callback?code=example&state=${url.searchParams.get('state')}`), 200)
  const state = await result
  assert.equal(state.connected, false)
  assert.equal(state.accounts?.length, 2)
  assert.equal((await selectCloudflareAccount('00000000000000000000000000000000')).ok, false)
  assert.equal((await selectCloudflareAccount(account2)).accountId, account2)
  disconnectCloudflare()
  multi = false
})

test('refreshes expiring access tokens without revealing them', async () => {
  expiresIn = 30
  refreshCalls = 0
  const { result, url } = await start()
  assert.equal(await request(`http://127.0.0.1:43862/callback?code=example&state=${url.searchParams.get('state')}`), 200)
  assert.equal((await result).connected, true)
  const state = await getCloudflareState()
  assert.equal(state.connected, true)
  assert.equal(refreshCalls, 1)
  assert.equal(JSON.stringify(state).includes('refreshed-token'), false)
  disconnectCloudflare()
  expiresIn = 3600
})

test('cancel stops pending OAuth and closes listener', async () => {
  const { result } = await start()
  cancelCloudflareAuth()
  assert.equal((await result).ok, false)
  assert.equal(fs.existsSync(path.join(dir, 'cloudflare-authorization.bin')), false)
})

test.after(() => { globalThis.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); delete (globalThis as Record<string, unknown>).__ftcsTestUrl })
