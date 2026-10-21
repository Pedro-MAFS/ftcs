import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DETAIL_READY,
  DETAIL_UNREACHABLE,
  DETAIL_WINDOW_CLOSED,
  judgeBuiltinBrowserReady,
} from './readiness.ts'

test('T1 window and version together are ready', () => {
  const result = judgeBuiltinBrowserReady({
    windowAlive: true,
    versionHttpStatus: 200,
    webSocketDebuggerUrl: 'ws://127.0.0.1:43123/devtools/browser/abc',
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.detail, DETAIL_READY)
})

test('T2 a dead window is not ready even if HTTP 200', () => {
  const result = judgeBuiltinBrowserReady({
    windowAlive: false,
    versionHttpStatus: 200,
    webSocketDebuggerUrl: 'ws://127.0.0.1:43123/devtools/browser/abc',
  })
  assert.equal(result.status, 'error')
  assert.equal(result.detail, DETAIL_WINDOW_CLOSED)
})

test('T3 a live window with HTTP 500 or a timeout is not ready', () => {
  for (const status of [500, null]) {
    const result = judgeBuiltinBrowserReady({
      windowAlive: true,
      versionHttpStatus: status,
      webSocketDebuggerUrl: status === 500 ? 'ws://127.0.0.1:1/devtools/browser/a' : null,
    })
    assert.equal(result.status, 'error')
    assert.equal(result.detail, DETAIL_UNREACHABLE)
  }
})

test('T4 an empty debugger url is not ready', () => {
  const result = judgeBuiltinBrowserReady({
    windowAlive: true,
    versionHttpStatus: 200,
    webSocketDebuggerUrl: '',
  })
  assert.equal(result.status, 'error')
  assert.equal(result.detail, DETAIL_UNREACHABLE)
})

test('T5 env probe no longer looks up system Chrome', () => {
  const source = readFileSync(new URL('../onboarding/env-probe.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('chrome.exe'), false)
  assert.equal(source.includes('App Paths'), false)
  assert.equal(source.includes('CHROME_INSTALL_URL'), false)
  assert.equal(source.includes("findOnPath('chrome')"), false)
  assert.equal(source.includes('findOnPath("chrome")'), false)
  assert.equal(source.includes('probeBuiltinBrowser'), true)
})
