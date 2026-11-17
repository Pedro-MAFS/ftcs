import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OFFICIAL_ENRICH_BLOCKED } from './hunter-channel-copy.ts'
import {
  CUSTOM_HUNTER_BANNER,
  CUSTOM_HUNTER_BATCH_TITLE,
  CUSTOM_HUNTER_KEY_TITLE,
  OFFICIAL_ENRICH_TITLE,
  OFFICIAL_ENRICH_VERIFY_TITLE,
  canEnrichLeadGate,
  enrichBannerText,
  enrichBlockedTitle,
  enrichCredentialReady,
  enrichLeadTitle,
  enrichNotReadyMessage,
} from './enrich-lead-gate.ts'

const scored = {
  phase: 'scored',
  hasDomain: true,
  busy: false,
}

describe('enrich lead gate', () => {
  it('官方已开通且无 Hunter Key：可补全，提示不含单价', () => {
    const input = {
      ...scored,
      channelMode: 'official',
      officialProvisioned: true,
      hunterKeySet: false,
      verifyEmails: false,
    }
    assert.equal(enrichCredentialReady(input), true)
    assert.equal(canEnrichLeadGate(input), true)
    assert.equal(enrichLeadTitle(input), OFFICIAL_ENRICH_TITLE)
    assert.equal(enrichLeadTitle(input).includes('credit'), false)
    assert.equal(enrichLeadTitle(input).includes('Hunter 账单'), false)
    assert.equal(
      enrichLeadTitle({ ...input, verifyEmails: true }),
      OFFICIAL_ENRICH_VERIFY_TITLE,
    )
    assert.equal(enrichLeadTitle({ ...input, verifyEmails: true }).includes('credit'), false)
  })

  it('官方已开通仍要求已评分和可解析域名', () => {
    const base = {
      channelMode: 'official',
      officialProvisioned: true,
      hunterKeySet: false,
      verifyEmails: false,
      busy: false,
    }
    assert.equal(canEnrichLeadGate({ ...base, phase: 'raw', hasDomain: true }), false)
    assert.equal(canEnrichLeadGate({ ...base, phase: 'scored', hasDomain: false }), false)
    assert.equal(enrichLeadTitle({ ...base, phase: 'raw', hasDomain: true }), '仅已评分线索可补全联系人')
  })

  it('官方未开通不可补全，文案指向模型通道且不提 Hunter Key', () => {
    const input = {
      ...scored,
      channelMode: 'official',
      officialProvisioned: false,
      hunterKeySet: true,
      verifyEmails: false,
    }
    assert.equal(enrichCredentialReady(input), false)
    assert.equal(canEnrichLeadGate(input), false)
    assert.equal(enrichLeadTitle(input), OFFICIAL_ENRICH_BLOCKED)
    assert.equal(enrichBannerText(input), OFFICIAL_ENRICH_BLOCKED)
    assert.equal(enrichBlockedTitle(input), OFFICIAL_ENRICH_BLOCKED)
    assert.equal(enrichNotReadyMessage(input), OFFICIAL_ENRICH_BLOCKED)
    assert.equal(OFFICIAL_ENRICH_BLOCKED.includes('Hunter'), false)
    assert.match(OFFICIAL_ENRICH_BLOCKED, /设置 → 模型通道/)
  })

  it('官方已开通不显示需 Key 横幅', () => {
    assert.equal(
      enrichBannerText({
        channelMode: 'official',
        officialProvisioned: true,
        hunterKeySet: false,
      }),
      '',
    )
  })

  it('自定义无 Key 仍不可补全，有 Key 时保留 credit 提示', () => {
    const missing = {
      ...scored,
      channelMode: 'custom',
      officialProvisioned: false,
      hunterKeySet: false,
      verifyEmails: false,
    }
    assert.equal(enrichCredentialReady(missing), false)
    assert.equal(canEnrichLeadGate(missing), false)
    assert.equal(enrichLeadTitle(missing), CUSTOM_HUNTER_KEY_TITLE)
    assert.equal(enrichBannerText(missing), CUSTOM_HUNTER_BANNER)
    assert.equal(enrichBlockedTitle(missing), CUSTOM_HUNTER_BATCH_TITLE)
    assert.equal(enrichNotReadyMessage(missing), CUSTOM_HUNTER_KEY_TITLE)

    const ready = { ...missing, hunterKeySet: true }
    assert.equal(canEnrichLeadGate(ready), true)
    assert.match(enrichLeadTitle(ready), /约 1 credit/)
    assert.match(enrichLeadTitle({ ...ready, verifyEmails: true }), /约 0.5 credit/)
  })
})
