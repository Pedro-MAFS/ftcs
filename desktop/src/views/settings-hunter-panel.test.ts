import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { OFFICIAL_HUNTER_SETTINGS_COPY } from '../domain/hunter-channel-copy.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

function hunterBlock(): { official: string; custom: string; all: string } {
  const vue = fs.readFileSync(path.join(here, 'SettingsView.vue'), 'utf8')
  const start = vue.indexOf('<h4>Hunter · 补全联系人</h4>')
  const end = vue.indexOf('<!-- 开发信 -->')
  const all = vue.slice(start, end)
  const officialStart = all.indexOf('<template v-if="isOfficial">')
  const customStart = all.indexOf('<template v-else>')
  return {
    all,
    official: all.slice(officialStart, customStart),
    custom: all.slice(customStart),
  }
}

describe('settings hunter panel', () => {
  it('官方区块只有免配说明和验邮开关，没有 Key 或测试入口', () => {
    const { official, all } = hunterBlock()
    assert.match(official, /OFFICIAL_HUNTER_SETTINGS_COPY/)
    assert.equal(OFFICIAL_HUNTER_SETTINGS_COPY.includes('单价'), false)
    assert.match(OFFICIAL_HUNTER_SETTINGS_COPY, /无需自备 Hunter API Key/)
    assert.match(OFFICIAL_HUNTER_SETTINGS_COPY, /费用从官方通道余额扣除/)
    assert.match(official, /v-model="form\.hunterVerifyEmails"/)
    assert.match(official, /允许对关键人验证邮箱/)
    assert.match(official, /由智能体决定验谁、验几封，请注意节省用量。/)
    assert.equal(official.includes('补全联系人时验证邮箱'), false)
    assert.equal(official.includes('测试连接'), false)
    assert.equal(official.includes('打开 Hunter'), false)
    assert.equal(official.includes('服务条款'), false)
    assert.equal(official.includes('添加 Key'), false)
    assert.equal(official.includes('v-model="hunterKeySlots'), false)
    assert.match(all, /<h4>Hunter · 补全联系人<\/h4>/)
  })

  it('自定义区块保留 Key、测试、条款和注册入口', () => {
    const { custom } = hunterBlock()
    assert.match(custom, /费用由 Hunter 收取/)
    assert.match(custom, /Hunter 服务条款/)
    assert.match(custom, /Hunter API Key/)
    assert.match(custom, /添加 Key/)
    assert.match(custom, /打开 Hunter/)
    assert.match(custom, /测试连接/)
    assert.match(custom, /v-model="form\.hunterVerifyEmails"/)
    assert.match(custom, /允许对关键人验证邮箱/)
    assert.match(custom, /由智能体决定验谁、验几封，请注意节省用量。/)
    assert.equal(custom.includes('补全联系人时验证邮箱'), false)
    assert.match(custom, /onTestHunter/)
  })
})

describe('onboarding does not collect a Hunter key', () => {
  it('首次引导没有 Hunter Key 输入', () => {
    const overlay = fs.readFileSync(
      path.join(here, '../components/onboarding/OnboardingOverlay.vue'),
      'utf8',
    )
    assert.equal(/hunter/i.test(overlay), false)
  })
})
