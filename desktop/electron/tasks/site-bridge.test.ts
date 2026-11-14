import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's test runner executes TypeScript files directly.
import { openTaskBridge } from './bridge.ts'

test('site bridge requires a single-use host ticket for the matching session and tool', async () => {
  let active = true, executions = 0
  const bridge = await openTaskBridge(() => ({
    disconnect() {}, async begin() { return {} }, done() { return {} }, recordWrite() {},
    authorize(identity) { if (!active || identity.sessionID !== 's1') throw new Error('会话无效'); return undefined },
    async siteTool(_identity, name) { executions++; return { name } },
  }))
  const post = async (endpoint: string, key: string, body: unknown) => {
    const response = await fetch(`${bridge.url}/${endpoint}`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  try {
    assert.equal((await post('site_execute', bridge.mcpKey, { name: 'site_preview' })).status, 400)
    const before = await post('before', bridge.pluginKey, { sessionID: 's1', callID: 'c1', tool: 'lead-store_site_preview', args: {} })
    assert.equal(before.status, 200)
    assert.equal((await post('site_execute', bridge.mcpKey, { _ticket: before.body.ticket, name: 'site_build' })).status, 400)
    const next = await post('before', bridge.pluginKey, { sessionID: 's1', callID: 'c2', tool: 'lead-store_site_preview', args: {} })
    active = false
    assert.equal((await post('site_execute', bridge.mcpKey, { _ticket: next.body.ticket, name: 'site_preview' })).status, 400)
    assert.equal(executions, 0)
    active = true
    const last = await post('before', bridge.pluginKey, { sessionID: 's1', callID: 'c3', tool: 'lead-store_site_preview', args: {} })
    assert.equal((await post('site_execute', bridge.mcpKey, { _ticket: last.body.ticket, name: 'site_preview' })).status, 200)
    assert.equal((await post('site_execute', bridge.mcpKey, { _ticket: last.body.ticket, name: 'site_preview' })).status, 400)
    assert.equal(executions, 1)
    const oldUrl = process.env.FTCS_TASK_URL, oldKey = process.env.FTCS_TASK_PLUGIN_KEY
    try {
      process.env.FTCS_TASK_URL = bridge.url; process.env.FTCS_TASK_PLUGIN_KEY = bridge.pluginKey
      // @ts-expect-error The runtime workspace plugin is JavaScript without declarations.
      const { TaskContext } = await import('../../../workspace/config/opencode/task-context.mjs')
      const hook = await TaskContext(), args: Record<string, unknown> = {}
      await hook['tool.execute.before']({ sessionID: 's1', callID: 'c4', tool: 'lead-store_site_build' }, { args })
      assert.equal(typeof args._ticket, 'string')
      assert.equal((await post('site_execute', bridge.mcpKey, { _ticket: args._ticket, name: 'site_build' })).status, 200)
      assert.equal(executions, 2)
    } finally {
      if (oldUrl === undefined) delete process.env.FTCS_TASK_URL; else process.env.FTCS_TASK_URL = oldUrl
      if (oldKey === undefined) delete process.env.FTCS_TASK_PLUGIN_KEY; else process.env.FTCS_TASK_PLUGIN_KEY = oldKey
    }
  } finally { bridge.close() }
})
