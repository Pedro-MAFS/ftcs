import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHAT_START_ALREADY_RUNNING,
  CHAT_START_BAD_STEP,
  CHAT_START_NO_PRODUCT,
  chatStartFailureLine,
  isChatStartQuestion,
  isChatStartQuestionRequest,
  parseChatStartAnswers,
  preflightKindFor,
  resolveChatProductId,
} from './chat-start-task.ts'

describe('parseChatStartAnswers', () => {
  const questions = [{ header: '渠道' }, { header: '产品' }, { header: '阶段' }]

  it('按题头取提交值，阶段不是探索时丢掉渠道', () => {
    assert.deepEqual(parseChatStartAnswers(questions, [['r2'], ['prd_2'], ['keywords']]), {
      ok: true,
      stage: 'keywords',
      product_id: 'prd_2',
    })
    assert.deepEqual(parseChatStartAnswers(questions, [['r3'], ['prd_2'], ['email']]), {
      ok: true,
      stage: 'email',
      product_id: 'prd_2',
    })
    assert.deepEqual(parseChatStartAnswers(questions, [['r1'], ['  '], ['score']]), {
      ok: true,
      stage: 'score',
      product_id: null,
    })
  })

  it('探索必须带 r1、r2 或 r3', () => {
    assert.deepEqual(parseChatStartAnswers(questions, [['r2'], ['prd_2'], ['explore']]), {
      ok: true,
      stage: 'explore',
      product_id: 'prd_2',
      explore_channel: 'r2',
    })
    assert.deepEqual(
      parseChatStartAnswers(
        [{ header: '产品' }, { header: '阶段' }],
        [['prd_2'], ['explore']],
      ),
      { ok: false, code: 'missing_channel' },
    )
    assert.deepEqual(parseChatStartAnswers(questions, [['web'], ['prd_2'], ['explore']]), {
      ok: false,
      code: 'missing_channel',
    })
  })

  it('阶段不是四者之一，或题头不是启任务卡', () => {
    assert.deepEqual(parseChatStartAnswers(questions, [['r1'], ['prd_2'], ['profile']]), {
      ok: false,
      code: 'bad_stage',
    })
    assert.equal(
      parseChatStartAnswers(
        [{ header: '产品' }, { header: '阶段' }, { header: '备注' }],
        [['prd_2'], ['keywords'], ['x']],
      ),
      null,
    )
    assert.equal(parseChatStartAnswers([{ header: '范围' }], [['继续']]), null)
    assert.equal(isChatStartQuestion(['产品', '阶段', '产品']), false)
    assert.equal(isChatStartQuestionRequest([{ header: '产品' }, { header: '阶段' }]), true)
    assert.equal(isChatStartQuestionRequest([{ header: '范围' }]), false)
    assert.equal(isChatStartQuestionRequest('不是题'), false)
  })
})

describe('chat start copy', () => {
  it('keeps the locked sentences and prefixes the existing run reason', () => {
    assert.equal(chatStartFailureLine('bad_stage'), CHAT_START_BAD_STEP)
    assert.equal(chatStartFailureLine('missing_channel'), CHAT_START_BAD_STEP)
    assert.equal(chatStartFailureLine(CHAT_START_NO_PRODUCT), CHAT_START_NO_PRODUCT)
    assert.equal(
      chatStartFailureLine('未授权，任务未启动。'),
      '任务没有启动：未授权，任务未启动。',
    )
    assert.equal(chatStartFailureLine('已有任务在运行，请稍候或先中止'), CHAT_START_ALREADY_RUNNING)
    assert.equal(
      chatStartFailureLine('画像未就绪（draft）。缺失：公司名'),
      '任务没有启动：画像未就绪（draft）。缺失：公司名',
    )
    assert.equal(resolveChatProductId('prd_explicit', ['prd_explicit', 'prd_other']), 'prd_explicit')
    assert.equal(resolveChatProductId('prd_missing', ['prd_explicit']), '')
    assert.equal(resolveChatProductId(null, ['prd_explicit']), '')
    assert.equal(resolveChatProductId('  ', ['prd_explicit']), '')
  })

  it('maps stages onto the existing preflight kinds', () => {
    assert.equal(preflightKindFor({ ok: true, stage: 'keywords', product_id: null }), 'expand-keywords')
    assert.equal(
      preflightKindFor({ ok: true, stage: 'explore', product_id: null, explore_channel: 'r1' }),
      'discover-leads',
    )
    assert.equal(
      preflightKindFor({ ok: true, stage: 'explore', product_id: null, explore_channel: 'r3' }),
      'discover-leads-r3',
    )
    assert.equal(preflightKindFor({ ok: true, stage: 'score', product_id: null }), 'score-and-dedupe')
    assert.equal(preflightKindFor({ ok: true, stage: 'email', product_id: 'prd' }), 'draft-email')
  })
})
