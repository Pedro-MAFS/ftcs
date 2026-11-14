import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's test runner executes TypeScript files directly.
import { SiteAgentActions } from './site-agent-actions.ts'
import type { SiteRuntimeSnapshot } from './site-runtime.ts'
import type { PublishPreview, ReleaseRecord } from './site-publish.ts'

function fixture() {
  const run = () => ({ id: '', state: 'idle' as const, message: '', log: '' })
  const state: SiteRuntimeSnapshot = { workspaceRoot: '/work', sequence: 1, outputDir: 'dist', dependencies: 'unknown', install: run(), preview: run(), build: run() }
  const target = { id: 1, owner: 'me', name: 'site', fullName: 'me/site', branch: 'main', private: false }
  const release: ReleaseRecord = { version: 1, createdRepositories: [], target, commitSha: 'abc' }
  const preview: PublishPreview = { id: 'p1', target, head: 'abc', hash: 'hash', files: [], deleted: [], log: '', noChanges: true }
  let starts = 0, builds = 0, notifications = 0, opens = 0
  const actions = new SiteAgentActions({
    snapshot: () => state,
    startPreview: () => { starts++; state.preview = { ...state.preview, id: 'preview', state: 'starting' }; return 'preview' },
    build: () => { builds++; state.build = { ...state.build, id: 'build', state: 'running' }; return 'build' },
    openPreview: async () => { opens++ }, release: () => release,
    connections: async () => ({ github: true, cloudflare: true }),
    prepare: async () => preview,
    notify: () => { notifications++ },
  })
  return { actions, state, release, preview, counts: () => ({ starts, builds, notifications, opens }) }
}

test('agent actions use shared asynchronous runs and open only verified preview', async () => {
  const f = fixture(), active = () => true
  await f.actions.execute('site_preview', '/work', active)
  await f.actions.execute('site_preview', '/work', active)
  await f.actions.execute('site_build', '/work', active)
  await f.actions.execute('site_build', '/work', active)
  await assert.rejects(f.actions.execute('site_open_preview', '/work', active), /尚未确认/)
  f.state.preview = { ...f.state.preview, state: 'running', url: 'http://127.0.0.1:3000/' }
  await f.actions.execute('site_open_preview', '/work', active)
  assert.deepEqual(f.counts(), { starts: 1, builds: 1, notifications: 0, opens: 1 })
  assert.equal((await f.actions.execute('site_status', '/work', active) as { build: { state: string } }).build.state, 'running')
})

test('release preparation remains a reviewable page snapshot and requires an existing target', async () => {
  const f = fixture()
  const result = await f.actions.execute('site_publish_prepare', '/work', () => true) as { message: string }
  assert.match(result.message, /尚未推送/)
  assert.equal(f.actions.getPending('/work'), f.preview)
  assert.equal(f.actions.getPending('/other'), null)
  assert.equal(f.counts().notifications, 1)
  f.actions.clear('/work')
  assert.equal(f.actions.getPending('/work'), null)
  delete f.release.target
  await assert.rejects(f.actions.execute('site_publish_prepare', '/work', () => true), /发布目标/)
})

test('ended sessions cannot start operations or expose a prepared release', async () => {
  const f = fixture()
  await assert.rejects(f.actions.execute('site_preview', '/work', () => false), /会话已结束/)
  let checks = 0
  await assert.rejects(f.actions.execute('site_publish_prepare', '/work', () => ++checks < 3), /会话已结束/)
  assert.equal(f.actions.getPending('/work'), null)
  assert.equal(f.counts().notifications, 0)
})
