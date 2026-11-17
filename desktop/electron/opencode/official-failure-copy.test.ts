import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

function skill(): string {
  return fs.readFileSync(
    path.join(repoRoot, 'workspace/skills/enrich-lead-contacts/SKILL.md'),
    'utf8',
  )
}

function promptSource(): string {
  return fs.readFileSync(path.join(here, 'agent-runner.ts'), 'utf8')
}

describe('official hunter failure copy', () => {
  it('技能把官方余额、凭证、503、限流、范围和通用失败分开，且不引导 Hunter 充值', () => {
    const text = skill()
    assert.match(text, /官方通道余额不足。请到设置 → 模型通道查看余额并充值。/)
    assert.match(text, /不是 Hunter 充值/)
    assert.match(text, /官方通道凭证不可用。请到设置 → 模型通道登录、开通或检查官方通道。/)
    assert.match(text, /不要提示更换 Hunter Key/)
    assert.match(text, /补全联系人暂时不可用，请稍后再试。/)
    assert.match(text, /价目未开也是这一句/)
    assert.match(text, /请求过于频繁，请稍后重试。/)
    assert.match(text, /这不是余额不足/)
    assert.match(text, /当前查找范围超出限制。/)
    assert.match(text, /补全联系人暂时失败，请稍后重试。/)
    assert.match(text, /验证尚未完成，请稍后再次验证。/)
    assert.match(text, /验证暂时失败，请稍后重试。/)
    assert.match(text, /两句不是同一种失败/)
    assert.match(text, /不假定这次没计费/)
    assert.equal(text.includes('status === 402'), false)
  })

  it('HUNTER_NO_KEY 与额度句只描述自定义通道', () => {
    const text = skill()
    const custom = text.indexOf('自定义通道才使用这些 code')
    const official = text.indexOf('官方通道：停止，并原样转述工具')
    assert.ok(custom >= 0 && official > custom)
    const customBlock = text.slice(custom, official)
    assert.match(customBlock, /HUNTER_NO_KEY/)
    assert.match(customBlock, /HUNTER_UNAUTHORIZED/)
    assert.match(customBlock, /HUNTER_QUOTA_EXCEEDED/)
    assert.match(customBlock, /HUNTER_ALL_KEYS_EXHAUSTED/)
    assert.match(customBlock, /用户自己的 Hunter 额度/)
    assert.match(text, /官方工具不会返回 `HUNTER_NO_KEY`/)
  })

  it('补全提示同时保留官方转述和自定义 Hunter 文案', () => {
    const text = promptSource()
    assert.match(text, /官方通道余额不足。请到设置 → 模型通道查看余额并充值。/)
    assert.match(text, /不要改写成「配置 Hunter API Key」或「到 Hunter 充值」/)
    assert.match(text, /不要改打 api\.hunter\.io/)
    assert.match(text, /验证尚未完成，请稍后再次验证。/)
    assert.match(text, /验证暂时失败，请稍后重试。/)
    assert.match(text, /仅 HUNTER_NO_KEY \/ HUNTER_UNAUTHORIZED 提示配置 Hunter API Key/)
    assert.match(text, /仅 HUNTER_QUOTA_EXCEEDED \/ HUNTER_ALL_KEYS_EXHAUSTED/)
    assert.match(text, /不要把这两句用于官方通道/)
  })
})
