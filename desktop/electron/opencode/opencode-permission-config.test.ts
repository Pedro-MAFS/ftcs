import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

type PermissionRule = string | { [key: string]: PermissionRule }

function sanitizeMcpName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_')
}

describe('opencode.json permission（US-FD-02 §5）', () => {
  const config = JSON.parse(
    readFileSync(new URL('../../../workspace/config/opencode/opencode.json', import.meta.url), 'utf8'),
  ) as {
    permission?: PermissionRule
    permissions?: unknown
    mcp?: Record<string, unknown>
  }

  it('仍是 v1 permission 对象，没有 v2 permissions 数组', () => {
    assert.equal(Array.isArray(config.permission), false)
    assert.equal(typeof config.permission, 'object')
    assert.ok(config.permission)
    assert.equal(Object.hasOwn(config, 'permissions'), false)
    assert.equal(Object.keys(config.permission as object)[0], '*')
  })

  it('每个内置 MCP 除 ftcs-task 外都是 allow，ftcs-task 只询问', () => {
    const permission = config.permission as Record<string, PermissionRule>
    const mcpNames = Object.keys(config.mcp ?? {})
    assert.ok(mcpNames.length > 0)
    for (const name of mcpNames) {
      const key = `${sanitizeMcpName(name)}_*`
      if (name === 'ftcs-task') {
        assert.equal(permission[key], 'ask')
        assert.notEqual(permission[key], 'allow')
        continue
      }
      assert.equal(permission[key], 'allow', key)
    }
    assert.equal(permission['ftcs-task_*'], 'ask')
    assert.notEqual(permission['ftcs-task_*'], 'allow')
    const task = config.mcp?.['ftcs-task'] as { command?: string[]; enabled?: boolean } | undefined
    assert.deepEqual(task?.command, ['node', 'mcp-servers/ftcs-task/dist/mcp.js'])
    assert.equal(task?.enabled, true)
  })

  it('硬边界拒绝，网页抓取仍要询问', () => {
    const permission = config.permission as Record<string, PermissionRule>
    assert.equal(permission.edit, 'deny')
    assert.equal(permission.bash, 'deny')
    assert.equal(permission.external_directory, 'deny')
    assert.equal(permission.webfetch, 'ask')
    assert.equal(permission.websearch, 'ask')
    assert.equal(permission.task, 'ask')
    assert.equal(permission.lsp, 'deny')
    assert.equal(permission['*'], 'ask')
    assert.deepEqual(permission.skill, { '*': 'allow' })
    for (const key of ['read', 'glob', 'grep', 'question', 'todowrite', 'doom_loop']) {
      assert.equal(permission[key], 'allow', key)
    }
    const values = JSON.stringify(permission)
    assert.equal(values.includes('"always"'), false)
  })
})
