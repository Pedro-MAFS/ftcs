import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatUpdateCheckMessage } from './update-check-message.ts'
import {
  delayUntilNextUpdateCheck,
  UPDATE_CHECK_INTERVAL_MS,
} from './update-schedule.ts'

describe('update check schedule', () => {
  it('uses 24 hours and does not schedule a negative delay', () => {
    assert.equal(UPDATE_CHECK_INTERVAL_MS, 24 * 60 * 60 * 1000)
    const now = Date.parse('2026-10-03T00:00:00.000Z')
    const recent = new Date(now - 60 * 60 * 1000).toISOString()
    assert.equal(delayUntilNextUpdateCheck(recent, now), 23 * 60 * 60 * 1000)
    const expired = new Date(now - UPDATE_CHECK_INTERVAL_MS - 1000).toISOString()
    assert.equal(delayUntilNextUpdateCheck(expired, now), 0)
  })
})

describe('update check message', () => {
  it('does not describe a failed check as already up to date', () => {
    const message = formatUpdateCheckMessage({
      ok: false,
      hasUpdate: false,
      currentVersion: '0.5.6',
      latestVersion: null,
      errorMessage: 'HTTP 500',
    })
    assert.equal(message.startsWith('检查更新失败'), true)
    assert.equal(message.includes('已是最新'), false)
    assert.equal(message, '检查更新失败：HTTP 500')
  })

  it('keeps the latest and found-update sentences', () => {
    assert.equal(
      formatUpdateCheckMessage({
        ok: true,
        hasUpdate: false,
        currentVersion: '0.5.6',
        latestVersion: '0.5.6',
      }),
      '已是最新版本（0.5.6）',
    )
    assert.equal(
      formatUpdateCheckMessage({
        ok: true,
        hasUpdate: true,
        currentVersion: '0.5.6',
        latestVersion: '0.5.7',
      }),
      '发现新版本 0.5.7',
    )
  })
})
