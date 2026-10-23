import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AgentPreflightKind } from '../ipc/types.ts'
import {
  PREFLIGHT_BROWSER_NOT_READY,
  PREFLIGHT_BROWSER_READY,
  PREFLIGHT_BROWSER_UNAVAILABLE,
  needsBuiltinBrowser,
  resolveBuiltinBrowserCheck,
} from './builtin-browser-check.ts'

function messageFor(detail: string): string {
  return `还有步骤没准备好。请按下面的说明处理后再试。\n· 内置浏览器：${detail}`
}

test('T4 browser judge failure stops before reconnect', async () => {
  let reconnects = 0
  const check = await resolveBuiltinBrowserCheck({
    ensure: async () => ({ ok: false }),
    getServers: async () => [{ name: 'chrome-devtools', status: 'connected' }],
    reconnect: async () => {
      reconnects += 1
    },
  })
  assert.equal(check.ok, false)
  assert.equal(check.detail, PREFLIGHT_BROWSER_NOT_READY)
  assert.equal(reconnects, 0)
  const message = messageFor(check.detail)
  assert.doesNotMatch(message, /MCP|chrome-devtools|Google Chrome|scored/i)
})

test('T5 a ready browser and a connected tool passes', async () => {
  const check = await resolveBuiltinBrowserCheck({
    ensure: async () => ({ ok: true }),
    getServers: async () => [{ name: 'chrome-devtools', status: 'connected' }],
    reconnect: async () => {
      throw new Error('should not reconnect')
    },
  })
  assert.equal(check.ok, true)
  assert.equal(check.detail, PREFLIGHT_BROWSER_READY)
  assert.equal(check.label, '内置浏览器')
  assert.equal(check.id, 'builtin-browser')
})

test('T6 failed after one reconnect is not reported as ready', async () => {
  let reconnects = 0
  const check = await resolveBuiltinBrowserCheck({
    ensure: async () => ({ ok: true }),
    getServers: async () => [{ name: 'chrome-devtools', status: 'failed' }],
    reconnect: async () => {
      reconnects += 1
    },
  })
  assert.equal(reconnects, 1)
  assert.equal(check.ok, false)
  assert.equal(check.detail, PREFLIGHT_BROWSER_UNAVAILABLE)
  assert.notEqual(check.detail, '已连接')
  assert.notEqual(check.detail, PREFLIGHT_BROWSER_READY)
})

test('T7 reconnects once and then passes', async () => {
  let reads = 0
  let reconnects = 0
  const check = await resolveBuiltinBrowserCheck({
    ensure: async () => ({ ok: true }),
    getServers: async () => {
      reads += 1
      return [{ name: 'chrome-devtools', status: reads === 1 ? 'failed' : 'Connected' }]
    },
    reconnect: async () => {
      reconnects += 1
    },
  })
  assert.equal(reconnects, 1)
  assert.equal(check.ok, true)
  assert.equal(check.detail, PREFLIGHT_BROWSER_READY)
})

test('T8 file-only extract profile skips the browser', () => {
  assert.equal(needsBuiltinBrowser('extract-profile', { requireBuiltinBrowser: false }), false)
})

test('T9 extract profile checks the browser when the caller does not say otherwise', () => {
  assert.equal(needsBuiltinBrowser('extract-profile'), true)
  assert.equal(needsBuiltinBrowser('extract-profile', {}), true)
})

test('T10 exploration cannot turn the browser check off', () => {
  assert.equal(needsBuiltinBrowser('discover-leads-r2', { requireBuiltinBrowser: false }), true)
  assert.equal(needsBuiltinBrowser('discover-leads', { requireBuiltinBrowser: false }), true)
  assert.equal(needsBuiltinBrowser('discover-leads-r3', { requireBuiltinBrowser: false }), true)
})

test('T11 scoring, mail, contacts and keywords do not check the browser', () => {
  const kinds: AgentPreflightKind[] = [
    'score-and-dedupe',
    'draft-email',
    'enrich-lead-contacts',
    'expand-keywords',
  ]
  for (const kind of kinds) {
    assert.equal(needsBuiltinBrowser(kind), false)
    assert.equal(needsBuiltinBrowser(kind, { requireBuiltinBrowser: true }), false)
  }
})

test('T12 social and map red lines stay in the skills', () => {
  const root = new URL('../../../workspace/skills/', import.meta.url)
  const r2 = readFileSync(new URL('discover-leads-r2/SKILL.md', root), 'utf8')
  const r3 = readFileSync(new URL('discover-leads-r3/SKILL.md', root), 'utf8')
  assert.match(r2, /禁止\*\*对社媒 URL 调用 chrome-devtools/)
  assert.match(r2, /new_page/)
  assert.match(r2, /navigate_page/)
  assert.match(r3, /google\.com\/maps/)
  assert.match(r3, /maps\.google\.com/)
  assert.match(r3, /goo\.gl\/maps/)
  assert.match(r3, /禁止\*\*用内置浏览器或任何页面工具打开 Google 地图/)
})
