import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Config } from '@opencode-ai/sdk/v2'
import { rewriteChromeDevtoolsLaunch } from './mcp-launch.ts'

const isolated = {
  mcp: {
    'lead-store': { command: ['node', 'lead.js'] },
    'chrome-devtools': {
      command: ['npx', '-y', 'chrome-devtools-mcp@1.6.0', '--isolated', '--channel', 'chrome'],
    },
  },
} as Config

test('T1 replaces an isolated launch with browserUrl and nothing else', () => {
  const next = rewriteChromeDevtoolsLaunch(isolated, 'http://127.0.0.1:43123') as {
    mcp: Record<string, { command: string[] }>
  }
  assert.deepEqual(next.mcp['chrome-devtools']?.command, [
    'npx',
    '-y',
    'chrome-devtools-mcp@1.6.0',
    '--browserUrl',
    'http://127.0.0.1:43123',
  ])
  const joined = next.mcp['chrome-devtools']!.command.join(' ')
  for (const banned of ['isolated', 'channel', 'autoConnect', 'executablePath', 'headless', 'chrome.exe']) {
    assert.equal(joined.toLowerCase().includes(banned.toLowerCase()), false)
  }
  assert.deepEqual(next.mcp['lead-store']?.command, ['node', 'lead.js'])
})

test('T2 a missing url still keeps browserUrl and drops isolated', () => {
  const next = rewriteChromeDevtoolsLaunch(isolated, null) as {
    mcp: Record<string, { command: string[] }>
  }
  assert.deepEqual(next.mcp['chrome-devtools']?.command, [
    'npx',
    '-y',
    'chrome-devtools-mcp@1.6.0',
    '--browserUrl',
    'http://127.0.0.1:0',
  ])
})

test('T3 config without chrome-devtools is unchanged', () => {
  const config = { mcp: { 'lead-store': { command: ['node', 'lead.js'] } } } as Config
  assert.equal(rewriteChromeDevtoolsLaunch(config, 'http://127.0.0.1:1'), config)
})

test('template and runtime no longer launch with --isolated', () => {
  const template = readFileSync(
    new URL('../../../workspace/config/opencode/opencode.json', import.meta.url),
    'utf8',
  )
  assert.equal(template.includes('--isolated'), false)
  assert.equal(template.includes('http://127.0.0.1:0'), true)
  const runtime = readFileSync(new URL('../opencode/runtime.ts', import.meta.url), 'utf8')
  assert.equal(runtime.includes('rewriteChromeDevtoolsLaunch'), true)
  assert.equal(runtime.includes('ensureBuiltinBrowser'), true)
})
