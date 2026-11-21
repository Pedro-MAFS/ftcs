import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSitePage } from '../../src/views/site-page-state.ts'

const run = { id: '', state: 'idle' as const, message: '', log: '' }
const root = '/workspace'
const binding = { accountId: 'account', project: 'store' }
const release = { version: 1 as const, createdRepositories: [], commitSha: 'abc', cloudflare: binding,
  target: { id: 1, owner: 'me', name: 'store', fullName: 'me/store', branch: 'main', private: false } }
const domains = { ...binding, subdomain: 'store.pages.dev', domains: [] }
const ok = <T>(value: T) => ({ ok: true as const, value })

function api(): Parameters<typeof readSitePage>[0] {
  return {
    getSite: async () => ({ status: 'ready', workspaceRoot: root, projectPath: root + '/website', message: '', dependencies: 'unknown' }),
    getSiteRuntime: async () => ({ workspaceRoot: root, sequence: 1, outputDir: 'dist', dependencies: 'unknown', install: run, preview: run, build: run }),
    getSiteSource: async () => ({ workspaceRoot: root, sequence: 1, state: 'clean', message: '', watching: true }),
    getAgentSiteRelease: async () => false,
    getGithubState: async () => ({ connected: true, login: 'me' }),
    getCloudflareState: async () => ({ connected: true, accountId: binding.accountId }),
    getSiteRelease: async () => ok(release),
    getSitePagesStatus: async () => ok({ state: 'waiting', message: '' }),
    listSiteDomains: async () => ok(domains),
  }
}

test('a linked site waits for its domains and reflects the release updated by the deployment check', async () => {
  const ipc = api()
  let resolveDomains!: (value: ReturnType<typeof ok<typeof domains>>) => void
  const delayed = new Promise<ReturnType<typeof ok<typeof domains>>>(resolve => { resolveDomains = resolve })
  ipc.listSiteDomains = () => delayed
  let checked = false
  ipc.getSitePagesStatus = async () => {
    checked = true
    return ok({ state: 'building', message: '', deploymentId: 'deploy' })
  }
  ipc.getSiteRelease = async () => ok({ ...release, snapshotHash: checked ? 'updated' : 'original' })
  let ready = false
  const result = readSitePage(ipc).then(snapshot => { ready = true; return snapshot })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(checked, true)
  assert.equal(ready, false)
  resolveDomains(ok(domains))
  const snapshot = await result
  assert.deepEqual(snapshot.domains, domains)
  assert.equal(snapshot.release.snapshotHash, 'updated')
})

test('disconnected accounts, pending installation and a different Cloudflare account are actionable states', async () => {
  const ipc = api()
  ipc.getGithubState = async () => ({ connected: false, authorized: true, installUrl: 'https://github.com/apps/ftcs' })
  ipc.getSitePagesStatus = ipc.listSiteDomains = async () => { throw new Error('unexpected lookup') }
  for (const state of [{ connected: false }, { connected: true, accountId: 'other' }]) {
    ipc.getCloudflareState = async () => state
    const snapshot = await readSitePage(ipc)
    assert.equal(snapshot.github.authorized, true)
    assert.equal(snapshot.deployment, null)
    assert.equal(snapshot.domains, null)
  }
})

test('failed connection and domain checks report the affected service and can be retried', async () => {
  const ipc = api()
  ipc.getGithubState = async () => ({ connected: false, checkFailed: true, message: '网络超时' })
  await assert.rejects(readSitePage(ipc), /GitHub.*网络超时/)
  ipc.getGithubState = api().getGithubState
  ipc.listSiteDomains = async () => ({ ok: false, message: 'HTTP 503' })
  await assert.rejects(readSitePage(ipc), /Cloudflare 域名.*503/)
  ipc.listSiteDomains = api().listSiteDomains
  assert.equal((await readSitePage(ipc)).cloudflare.connected, true)
})

test('a workspace change during remote lookup cannot return the previous site', async () => {
  const ipc = api()
  let activeRoot = root
  ipc.listSiteDomains = async () => {
    activeRoot = '/another-workspace'
    return ok(domains)
  }
  ipc.getAgentSiteRelease = async expected => {
    if (expected !== activeRoot) throw new Error('当前工作区已改变')
    return false
  }
  await assert.rejects(readSitePage(ipc), /工作区已改变/)
})
