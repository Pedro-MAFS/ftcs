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
  let starts = 0, builds = 0, notifications = 0, opens = 0, stops = 0, commits = 0
  const events: boolean[] = []
  const actions = new SiteAgentActions({
    snapshot: () => state,
    startPreview: () => { starts++; state.preview = { ...state.preview, id: 'preview', state: 'starting' }; return 'preview' },
    stopPreview: async (_root, id) => { assert.equal(id, state.preview.id); stops++; state.preview = { ...state.preview, state: 'stopping' } },
    build: () => { builds++; state.build = { ...state.build, id: 'build', state: 'running' }; return 'build' },
    openPreview: async () => { opens++ }, release: () => release,
    connections: async () => ({ github: true, cloudflare: true }),
    prepare: async () => preview,
    commit: async (_root, id) => { assert.equal(id, preview.id); commits++; return release },
    notify: (_root, running) => { notifications++; events.push(running) },
  })
  return { actions, state, release, preview, events, counts: () => ({ starts, builds, notifications, opens, stops, commits }) }
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
  assert.deepEqual(f.counts(), { starts: 1, builds: 1, notifications: 0, opens: 1, stops: 0, commits: 0 })
  assert.equal((await f.actions.execute('site_status', '/work', active) as { build: { state: string } }).build.state, 'running')
})

test('stops the active preview and reports its real state without stopping it twice', async () => {
  for (const initial of ['starting', 'running', 'address_pending'] as const) {
    const f = fixture()
    f.state.preview = { ...f.state.preview, id: 'preview', state: initial }
    const result = await f.actions.execute('site_stop_preview', '/work', () => true) as { message: string; preview: { state: string } }
    assert.equal(result.preview.state, 'stopping')
    assert.match(result.message, /正在停止/)
    await f.actions.execute('site_stop_preview', '/work', () => true)
    assert.equal(f.counts().stops, 1)
    f.state.preview = { ...f.state.preview, state: 'cancelled' }
    const stopped = await f.actions.execute('site_stop_preview', '/work', () => true) as { message: string }
    assert.match(stopped.message, /未运行/)
    assert.equal(f.counts().stops, 1)
  }
})

test('reports when a requested stop has not been confirmed', async () => {
  const run = () => ({ id: '', state: 'idle' as const, message: '', log: '' })
  const state: SiteRuntimeSnapshot = { workspaceRoot: '/work', sequence: 1, outputDir: 'dist', dependencies: 'unknown', install: run(), build: run(), preview: { ...run(), id: 'preview', state: 'running' } }
  const actions = new SiteAgentActions({
    snapshot: () => state, startPreview: () => '', stopPreview: async () => {}, build: () => '', openPreview: async () => {},
    release: () => ({ version: 1, createdRepositories: [] }), connections: async () => ({ github: false, cloudflare: false }),
    prepare: async () => { throw new Error('unused') }, commit: async () => { throw new Error('unused') }, notify: () => {},
  })
  const result = await actions.execute('site_stop_preview', '/work', () => true) as { message: string; preview: { state: string } }
  assert.equal(result.preview.state, 'running')
  assert.match(result.message, /停止未确认/)
})

test('publishes the checked snapshot once and requires an existing target', async () => {
  const f = fixture()
  f.preview.noChanges = false
  const result = await f.actions.execute('site_publish', '/work', () => true) as { message: string; commitSha: string }
  assert.match(result.message, /已推送到 GitHub/)
  assert.equal(result.commitSha, 'abc')
  assert.equal(f.counts().commits, 1)
  assert.deepEqual(f.events, [true, false])
  assert.equal(f.actions.isPublishing('/work'), false)
  delete f.release.target
  await assert.rejects(f.actions.execute('site_publish', '/work', () => true), /发布目标/)
  assert.equal(f.counts().commits, 1)
})

test('ended sessions cannot start operations or commit after preparing', async () => {
  const f = fixture()
  await assert.rejects(f.actions.execute('site_preview', '/work', () => false), /会话已结束/)
  await assert.rejects(f.actions.execute('site_stop_preview', '/work', () => false), /会话已结束/)
  let checks = 0
  await assert.rejects(f.actions.execute('site_publish', '/work', () => ++checks < 3), /会话已结束/)
  assert.equal(f.actions.isPublishing('/work'), false)
  assert.deepEqual(f.events, [true, false])
  assert.equal(f.counts().commits, 0)
})

test('does not commit a failed build and reports uncertain commits for recovery', async () => {
  for (const stage of ['prepare', 'commit'] as const) {
    const run = () => ({ id: '', state: 'idle' as const, message: '', log: '' })
    const state: SiteRuntimeSnapshot = { workspaceRoot: '/work', sequence: 1, outputDir: 'dist', dependencies: 'unknown', install: run(), build: run(), preview: run() }
    const target = { id: 1, owner: 'me', name: 'site', fullName: 'me/site', branch: 'main', private: false }
    const events: boolean[] = []
    let commits = 0
    const actions = new SiteAgentActions({
      snapshot: () => state, startPreview: () => '', stopPreview: async () => {}, build: () => '', openPreview: async () => {},
      release: () => ({ version: 1, createdRepositories: [], target, commitSha: 'old' }),
      connections: async () => ({ github: true, cloudflare: true }),
      prepare: async () => { if (stage === 'prepare') throw new Error('构建失败'); return { id: 'p', target, head: 'old', hash: '', files: [], deleted: [], log: '', noChanges: false } },
      commit: async () => { commits++; throw new Error('网络中断') },
      notify: (_root, running) => { events.push(running) },
    })
    await assert.rejects(actions.execute('site_publish', '/work', () => true), stage === 'prepare' ? /构建失败/ : /检查独立站页面发布记录/)
    assert.equal(commits, stage === 'prepare' ? 0 : 1)
    assert.deepEqual(events, [true, false])
    assert.equal(actions.isPublishing('/work'), false)
  }
})
