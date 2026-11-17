import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hunterPreflightLabel, resolveHunterStart } from './hunter-start.ts'
import { OFFICIAL_ENRICH_BLOCKED } from '../../src/domain/hunter-channel-copy.ts'

describe('resolveHunterStart', () => {
  it('自定义无 Key 禁止，且说明不影响探索和开发信', () => {
    const result = resolveHunterStart({ channelMode: 'custom', hunterApiKeySet: false })
    assert.equal(result.ok, false)
    assert.match(result.detail, /设置 → 集成/)
    assert.match(result.detail, /不影响探索\/开发信/)
    assert.equal(hunterPreflightLabel('custom'), 'Hunter API Key')
  })

  it('自定义有 Key 允许', () => {
    const result = resolveHunterStart({
      channelMode: 'custom',
      officialProvisioned: true,
      hunterApiKeySet: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.detail, 'Hunter API Key 已配置（BYOK）')
  })

  it('官方已开通、无 Key 放行', () => {
    const result = resolveHunterStart({
      channelMode: 'official',
      officialProvisioned: true,
      hunterApiKeySet: false,
    })
    assert.equal(result.ok, true)
    assert.equal(result.detail, '官方通道已包含补全联系人')
    assert.equal(hunterPreflightLabel('official'), '补全联系人')
  })

  it('官方未开通被挡住，文案与线索页相同且不提 Hunter', () => {
    const result = resolveHunterStart({
      channelMode: 'official',
      officialProvisioned: false,
      hunterApiKeySet: true,
    })
    assert.equal(result.ok, false)
    assert.equal(result.detail, OFFICIAL_ENRICH_BLOCKED)
    assert.equal(result.detail.includes('Hunter'), false)
  })
})
