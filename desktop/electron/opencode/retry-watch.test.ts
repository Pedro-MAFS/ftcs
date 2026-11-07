import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { retryWatchOnStatus } from './retry-watch.ts'

describe('retry watchdog', () => {
  it('starts once and keeps the same timer while retries continue', () => {
    assert.equal(retryWatchOnStatus(false, false, 'retry'), 'start')
    assert.equal(retryWatchOnStatus(true, false, 'retry'), 'continue')
  })

  it('releases when work resumes after a retry, before the session goes idle', () => {
    assert.equal(retryWatchOnStatus(true, false, 'busy'), 'recover')
  })

  it('releases when the session becomes idle after a retry', () => {
    assert.equal(retryWatchOnStatus(true, false, 'idle'), 'recover')
  })

  it('does not announce recovery when the session already failed', () => {
    assert.equal(retryWatchOnStatus(true, true, 'busy'), 'clear')
    assert.equal(retryWatchOnStatus(false, false, 'busy'), 'clear')
  })
})
