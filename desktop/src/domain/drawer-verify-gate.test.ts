import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CUSTOM_DRAWER_BLOCKED,
  OFFICIAL_DRAWER_BLOCKED,
  drawerVerifyBlockedMessage,
  drawerVerifyReady,
} from './drawer-verify-gate.ts'

describe('drawer verify gate', () => {
  it('官方已开通、无本机 Key 可以验证', () => {
    const input = {
      channelMode: 'official',
      officialProvisioned: true,
      hunterKeySet: false,
    }
    assert.equal(drawerVerifyReady(input), true)
  })

  it('官方未开通不可验证，提示不出现 Hunter', () => {
    const input = {
      channelMode: 'official',
      officialProvisioned: false,
      hunterKeySet: true,
    }
    assert.equal(drawerVerifyReady(input), false)
    assert.equal(drawerVerifyBlockedMessage(input), OFFICIAL_DRAWER_BLOCKED)
    assert.equal(OFFICIAL_DRAWER_BLOCKED.includes('Hunter'), false)
    assert.match(OFFICIAL_DRAWER_BLOCKED, /设置 → 模型通道/)
  })

  it('自定义仍看 Key，验邮开关不参与', () => {
    assert.equal(
      drawerVerifyReady({
        channelMode: 'custom',
        officialProvisioned: true,
        hunterKeySet: false,
      }),
      false,
    )
    assert.equal(
      drawerVerifyBlockedMessage({
        channelMode: 'custom',
        officialProvisioned: false,
        hunterKeySet: false,
      }),
      CUSTOM_DRAWER_BLOCKED,
    )
    assert.equal(
      drawerVerifyReady({
        channelMode: 'custom',
        officialProvisioned: false,
        hunterKeySet: true,
      }),
      true,
    )
  })
})

describe('drawer wiring', () => {
  it('线索页传入通道，抽屉不把 hunterKeySet 伪装成 true', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const leads = fs.readFileSync(path.join(here, '../views/LeadsView.vue'), 'utf8')
    assert.match(leads, /:hunter-key-set="hunterKeySet"/)
    assert.match(leads, /:channel-mode="channelMode"/)
    assert.match(leads, /:official-provisioned="officialProvisioned"/)
    const drawer = fs.readFileSync(
      path.join(here, '../components/shared/LeadDetailDrawer.vue'),
      'utf8',
    )
    assert.match(drawer, /drawerVerifyReady/)
    assert.match(drawer, /canVerifyPerson/)
    assert.match(drawer, /function emailStatusLabel/)
    assert.equal(drawer.includes('hunterKeySet = true'), false)
  })
})
