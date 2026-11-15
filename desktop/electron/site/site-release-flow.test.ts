import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteRelease } from '../../src/views/site-release-flow.ts'

test('a successful check commits the prepared snapshot once', async () => {
  const calls: string[] = []
  const result = await runSiteRelease({
    prepare: async () => { calls.push('prepare'); return { ok: true, value: { id: 'snapshot', noChanges: false } } },
    commit: async id => { calls.push(`commit:${id}`); return { ok: true, value: 'published' } },
    isCurrent: () => true,
    onCommit: () => { calls.push('committing') },
  })
  assert.deepEqual(calls, ['prepare', 'committing', 'commit:snapshot'])
  assert.deepEqual(result, { status: 'complete', value: 'published', noChanges: false })
})

test('a failed or cancelled check never commits', async () => {
  for (const cancelled of [false, true]) {
    let commits = 0
    const result = await runSiteRelease({
      prepare: async () => cancelled ? { ok: true, value: { id: 'snapshot', noChanges: false } } : { ok: false, message: '构建失败' },
      commit: async () => { commits++; return { ok: true, value: null } },
      isCurrent: () => !cancelled,
      onCommit: () => {},
    })
    assert.equal(result.status, cancelled ? 'stopped' : 'prepare-error')
    assert.equal(commits, 0)
  }
})

test('a commit error remains distinguishable from a build failure', async () => {
  const result = await runSiteRelease({
    prepare: async () => ({ ok: true, value: { id: 'snapshot', noChanges: true } }),
    commit: async () => { throw new Error('connection lost') },
    isCurrent: () => true,
    onCommit: () => {},
  })
  assert.equal(result.status, 'commit-error')
})
