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

  it('unknown 与 webmail 沿用现有状态映射', () => {
    assert.equal(mapHunterVerifierStatus('unknown'), 'hunter_unknown')
    assert.equal(mapHunterVerifierStatus('webmail'), 'hunter_invalid')
    assert.equal(mapHunterVerifierStatus('valid'), 'hunter_valid')
    assert.equal(mapHunterVerifierStatus('accept_all'), 'hunter_accept_all')
    assert.equal(mapHunterVerifierStatus('invalid'), 'hunter_invalid')
    assert.equal(mapHunterVerifierStatus('disposable'), 'hunter_invalid')
  })
})
