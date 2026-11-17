import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mapHunterVerifierStatus } from '../leads/person-helpers.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

describe('official verifier config', () => {
  it('hunter-api MCP 超时不小于 90 秒，拉起进程的 60 秒没有被拿来当验邮超时', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'workspace/config/opencode/opencode.json'), 'utf8'),
    ) as { mcp: { 'hunter-api': { timeout?: number } } }
    assert.ok((config.mcp['hunter-api'].timeout ?? 0) >= 90_000)

    const runtime = fs.readFileSync(path.join(here, 'runtime.ts'), 'utf8')
    assert.match(runtime, /timeout:\s*60_000/)
    const runner = fs.readFileSync(path.join(here, 'agent-runner.ts'), 'utf8')
    assert.match(runner, /case 'enrich-lead-contacts':\s*return 15 \* minute/)
    assert.equal(runner.includes('enrich-lead-contacts\':\n        return 60'), false)
  })

  it('技能在开关关闭时禁止验邮，504 不写成 unknown，502 与 504 分开', () => {
    const skill = fs.readFileSync(
      path.join(repoRoot, 'workspace/skills/enrich-lead-contacts/SKILL.md'),
      'utf8',
    )
    assert.match(skill, /verify_emails=false/)
    assert.match(skill, /禁止/)
    assert.match(skill, /unknown` → `hunter_unknown`（终态/)
    assert.match(skill, /webmail` → `hunter_invalid/)
    assert.match(skill, /验证尚未完成，请稍后再次验证/)
    assert.match(skill, /验证暂时失败，请稍后重试/)
    assert.match(skill, /\*\*不要\*\*写成 `hunter_unknown`/)
    assert.match(skill, /不要再打同一封/)
    assert.match(skill, /HUNTER_QUOTA_EXCEEDED/)
  })

  it('补全提示在开关关闭时禁止调用，打开时要求终态写回且失败不重试', () => {
    const runner = fs.readFileSync(path.join(here, 'agent-runner.ts'), 'utf8')
    assert.match(runner, /verify_emails=false：禁止调用 email_verifier/)
    assert.match(runner, /unknown 写成 hunter_unknown（终态）/)
    assert.match(runner, /webmail 写成 hunter_invalid/)
    assert.match(runner, /不要再打同一封/)
    assert.match(runner, /HUNTER_QUOTA_EXCEEDED \/ HUNTER_ALL_KEYS_EXHAUSTED/)
  })

  it('查找参数由当次决定，验邮只针对选中的关键人', () => {
    const skill = fs.readFileSync(
      path.join(repoRoot, 'workspace/skills/enrich-lead-contacts/SKILL.md'),
      'utf8',
    )
    const runner = fs.readFileSync(path.join(here, 'agent-runner.ts'), 'utf8')
    const gate = fs.readFileSync(
      path.join(repoRoot, 'desktop/src/domain/enrich-lead-gate.ts'),
      'utf8',
    )
    for (const text of [skill, runner]) {
      assert.equal(text.includes('DOMAIN_SEARCH_LIMIT'), false)
      assert.equal(text.includes('limit=10'), false)
      assert.equal(text.includes('limit: 10'), false)
      assert.equal(text.includes('domain_search（limit=10）'), false)
      assert.equal(/limit(?:=|:)\s*(?:25|30|50)/.test(text), false)
      assert.match(text, /翻页会增加官方通道费用/)
      assert.match(text, /不写单价/)
      assert.match(text, /不写账本/)
      assert.match(text, /不设最多翻几页/)
      assert.match(text, /不写死 `?type=personal/)
      assert.match(text, /由你决定验谁、验几封|由当次判断决定/)
      assert.match(
        text,
        /executive, it, finance, management, sales, legal, support, hr, marketing, communication, education, design, health, operations, product, research, consulting, administrative, procurement/,
      )
      assert.match(text, /junior, senior, executive/)
      assert.match(text, /不要用中文/)
    }
    assert.match(skill, /由当次判断决定/)
    assert.match(skill, /允许对关键联系人验邮/)
    assert.match(skill, /由你决定验谁、验几封/)
    assert.match(skill, /注意节省用量/)
    assert.match(skill, /可以少验 `info@` 和 generic/)
    assert.match(skill, /节省建议/)
    assert.match(skill, /未验的人留在 `people\[\]`/)
    assert.match(skill, /personal > generic/)
    assert.match(skill, /必须全量写入/)
    assert.match(skill, /sync_valid_to_contacts: false/)
    assert.equal(skill.includes('对全部候选'), false)
    assert.equal(skill.includes('email_verifier×每人'), false)
    assert.equal(skill.includes('每一条只调用一次'), false)
    assert.equal(skill.includes('每条只调用一次'), false)
    assert.equal(skill.includes('是否对全部候选人验邮'), false)
    assert.equal(runner.includes('每条只调用一次'), false)
    assert.equal(runner.includes('每一条只调用一次'), false)
    assert.match(runner, /由你决定验谁、验几封/)
    assert.match(runner, /注意节省用量/)
    assert.match(runner, /可以少验 info@ 和 generic/)
    assert.match(runner, /这只是节省建议，不是必须/)
    assert.match(runner, /未验的人留在 people\[\]/)
    assert.match(gate, /补全联系人并验证邮箱，费用从官方通道余额扣除/)
  })

  it('unknown 与 webmail 沿用现有状态映射', () => {
    assert.equal(mapHunterVerifierStatus('unknown'), 'hunter_unknown')
    assert.equal(mapHunterVerifierStatus('webmail'), 'hunter_invalid')
    assert.equal(mapHunterVerifierStatus('valid'), 'hunter_valid')
    assert.equal(mapHunterVerifierStatus('accept_all'), 'hunter_accept_all')
    assert.equal(mapHunterVerifierStatus('invalid'), 'hunter_invalid')
    assert.equal(mapHunterVerifierStatus('disposable'), 'hunter_invalid')
  })
})
