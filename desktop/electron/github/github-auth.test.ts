import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-github-test-'))
process.env.FTCS_GITHUB_TEST_DIR = dir
const electron = `export const app={getPath(){return process.env.FTCS_GITHUB_TEST_DIR}};export const safeStorage={isEncryptionAvailable(){return true},encryptString(s){return Buffer.from('encrypted:'+s)},decryptString(b){return b.toString().slice(10)}};`
registerHooks({ resolve(specifier, context, next) { return specifier === 'electron' ? { url: `data:text/javascript,${encodeURIComponent(electron)}`, shortCircuit: true } : next(specifier, context) } })
const { startGithubAuth, pollGithubAuth, cancelGithubAuth, getGithubState, disconnectGithub } = await import('./github-auth.ts')
const originalFetch = globalThis.fetch
const originalNow = Date.now
let now = 1_000_000
Date.now = () => now
process.env.FTCS_GITHUB_CLIENT_ID = 'test-client'
process.env.FTCS_GITHUB_APP_SLUG = 'ftcs-test-app'

test('device authorization, app installation, refresh and disconnect', async () => {
  let polls = 0
  let installed = false
  let refreshed = false
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'device-secret', user_code: 'ABCD-1234', expires_in: 600, interval: 5 })
    if (url.endsWith('/login/oauth/access_token')) {
      if (body.grant_type === 'refresh_token') { refreshed = true; return Response.json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 }) }
      polls++
      if (polls === 1) return Response.json({ error: 'authorization_pending' })
      return Response.json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 120 })
    }
    if (url === 'https://api.github.com/user') return Response.json({ login: 'test-user' })
    if (url.startsWith('https://api.github.com/user/installations')) return Response.json({ total_count: installed ? 1 : 0 })
    throw new Error(`unexpected endpoint: ${url}`)
  }
  const start = await startGithubAuth()
  assert.deepEqual(start, { ok: true, userCode: 'ABCD-1234', verificationUrl: 'https://github.com/login/device', interval: 5 })
  assert.equal((await pollGithubAuth()).status, 'pending')
  assert.equal(polls, 0)
  now += 5000
  assert.equal((await pollGithubAuth()).status, 'pending')
  now += 5000
  assert.equal((await pollGithubAuth()).status, 'connected')
  const needsInstall = await getGithubState()
  assert.equal(needsInstall.connected, false)
  assert.equal(needsInstall.authorized, true)
  assert.equal(needsInstall.installUrl, 'https://github.com/apps/ftcs-test-app/installations/new')
  installed = true
  assert.deepEqual(await getGithubState(), { connected: true, authorized: true, login: 'test-user' })
  now += 61000
  assert.equal((await getGithubState()).connected, true)
  assert.equal(refreshed, true)
  disconnectGithub()
  assert.equal((await getGithubState()).connected, false)
  await startGithubAuth()
  cancelGithubAuth()
  assert.equal((await pollGithubAuth()).status, 'failed')
})

test('uses the FTCS application client ID by default', async () => {
  delete process.env.FTCS_GITHUB_CLIENT_ID
  let submittedClientId = ''
  globalThis.fetch = async (_input, init) => {
    submittedClientId = JSON.parse(String(init?.body)).client_id
    return Response.json({ device_code: 'device-secret', user_code: 'ABCD-1234', expires_in: 600, interval: 5 })
  }
  const result = await startGithubAuth()
  assert.equal(result.ok, true)
  assert.equal(submittedClientId, 'Iv23liEZ4BHwJfmqOrpM')
  cancelGithubAuth()
  process.env.FTCS_GITHUB_CLIENT_ID = 'test-client'
})

test('canceling while a token response is in flight never stores it', async () => {
  let resolveToken: (value: Response) => void = () => {}
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/login/device/code')) return Response.json({ device_code: 'device-secret', user_code: 'ABCD-1234', expires_in: 600, interval: 5 })
    return await new Promise<Response>(resolve => { resolveToken = resolve })
  }
  assert.equal((await startGithubAuth()).ok, true)
  now += 5000
  const result = pollGithubAuth()
  cancelGithubAuth()
  resolveToken(Response.json({ access_token: 'should-not-be-stored' }))
  assert.equal((await result).status, 'failed')
  assert.equal(fs.existsSync(path.join(dir, 'github-authorization.bin')), false)
})

test.after(() => {
  globalThis.fetch = originalFetch
  Date.now = originalNow
  fs.rmSync(dir, { recursive: true, force: true })
})
