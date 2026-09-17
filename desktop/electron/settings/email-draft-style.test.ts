import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_EMAIL_DRAFT_STYLE_PROMPT,
  EMAIL_DRAFT_STYLE_PROMPT_MAX,
  formatEmailStylePromptBlock,
  normalizeEmailDraftStylePrompt,
  resolveEmailDraftStylePrompt,
} from './email-draft-style'

describe('email-draft-style', () => {
  it('normalize 空与 trim', () => {
    assert.deepEqual(normalizeEmailDraftStylePrompt(''), { ok: true, value: '' })
    assert.deepEqual(normalizeEmailDraftStylePrompt('  hi  '), { ok: true, value: 'hi' })
    assert.deepEqual(normalizeEmailDraftStylePrompt('\n简洁\n'), {
      ok: true,
      value: '简洁',
    })
  })

  it('normalize 码位上限 500', () => {
    const ok = '字'.repeat(EMAIL_DRAFT_STYLE_PROMPT_MAX)
    assert.equal(normalizeEmailDraftStylePrompt(ok).ok, true)
    const over = '字'.repeat(EMAIL_DRAFT_STYLE_PROMPT_MAX + 1)
    const res = normalizeEmailDraftStylePrompt(over)
    assert.equal(res.ok, false)
    if (!res.ok) {
      assert.match(res.message, /500/)
    }
  })

  it('resolve 缺省与空串用默认值', () => {
    assert.equal(resolveEmailDraftStylePrompt(undefined), DEFAULT_EMAIL_DRAFT_STYLE_PROMPT)
    assert.equal(resolveEmailDraftStylePrompt(null), DEFAULT_EMAIL_DRAFT_STYLE_PROMPT)
    assert.equal(resolveEmailDraftStylePrompt(1), DEFAULT_EMAIL_DRAFT_STYLE_PROMPT)
    assert.equal(resolveEmailDraftStylePrompt(''), DEFAULT_EMAIL_DRAFT_STYLE_PROMPT)
    assert.equal(resolveEmailDraftStylePrompt('   '), DEFAULT_EMAIL_DRAFT_STYLE_PROMPT)
    assert.equal(resolveEmailDraftStylePrompt('  a  '), 'a')
  })

  it('format 空不注入', () => {
    assert.equal(formatEmailStylePromptBlock(''), '')
    assert.equal(formatEmailStylePromptBlock('   '), '')
  })

  it('format 非空含用户原文', () => {
    const block = formatEmailStylePromptBlock('简洁、少套话')
    assert.match(block, /用户行文风格偏好/)
    assert.match(block, /简洁、少套话/)
    assert.match(block, /"""/)
  })
})
