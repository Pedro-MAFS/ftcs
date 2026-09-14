import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveHunterStart } from './hunter-start'

describe('resolveHunterStart', () => {
  it('无 Key 禁止', () => {
    const result = resolveHunterStart({ hunterApiKeySet: false })
    assert.equal(result.ok, false)
    assert.match(result.detail, /设置 → 集成/)
  })

  it('有 Key 允许', () => {
    const result = resolveHunterStart({ hunterApiKeySet: true })
    assert.equal(result.ok, true)
  })
})
