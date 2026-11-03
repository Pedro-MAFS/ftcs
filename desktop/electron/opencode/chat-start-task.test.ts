import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CHAT_START_ALREADY_RUNNING,
  CHAT_START_BAD_STEP,
  CHAT_START_NO_PRODUCT,
  CHAT_START_UNAUTHORIZED,
  chatStartFailureLine,
  isFtcsStartTaskPermission,
  isFtcsStartTaskTool,
  parseStartTaskOutput,
  preflightKindFor,
  resolveChatProductId,
} from './chat-start-task.ts'

describe('isFtcsStartTaskTool', () => {
  it('只认 start_task，不把子代理 task 当成启动', () => {
    assert.equal(isFtcsStartTaskTool('ftcs-task_start_task'), true)
    assert.equal(isFtcsStartTaskTool('start_task'), true)
    assert.equal(isFtcsStartTaskTool('FTCS-TASK_start_task'), true)
    assert.equal(isFtcsStartTaskTool('task'), false)
    assert.equal(isFtcsStartTaskTool('lead-store_product_save'), false)
    assert.equal(isFtcsStartTaskTool('webfetch'), false)
    assert.equal(isFtcsStartTaskPermission('task', 'ftcs-task_start_task'), true)
    assert.equal(isFtcsStartTaskPermission('ftcs-task_start_task'), true)
    assert.equal(isFtcsStartTaskPermission('webfetch', 'webfetch'), false)
  })
})

describe('parseStartTaskOutput', () => {
  it('reads the tool JSON, including a content wrapper', () => {
    const parsed = parseStartTaskOutput(
      JSON.stringify({ ok: true, stage: 'explore', product_id: '', explore_channel: 'r2' }),
    )
    assert.deepEqual(parsed, {
      ok: true,
      stage: 'explore',
      product_id: null,
      explore_channel: 'r2',
    })
    const wrapped = parseStartTaskOutput({
      content: [{ type: 'text', text: '{"ok":true,"stage":"email","product_id":"prd_2"}' }],
    })
    assert.deepEqual(wrapped, { ok: true, stage: 'email', product_id: 'prd_2' })
  })

  it('rejects a missing channel and an unknown stage', () => {
    assert.deepEqual(parseStartTaskOutput({ stage: 'explore' }), { ok: false, code: 'missing_channel' })
    assert.deepEqual(parseStartTaskOutput({ stage: 'profile' }), { ok: false, code: 'bad_stage' })
    assert.equal(parseStartTaskOutput('不是 JSON'), null)
  })
})

describe('chat start copy', () => {
  it('keeps the locked sentences and prefixes the existing run reason', () => {
    assert.equal(chatStartFailureLine('bad_stage'), CHAT_START_BAD_STEP)
    assert.equal(chatStartFailureLine('missing_channel'), CHAT_START_BAD_STEP)
    assert.equal(chatStartFailureLine(CHAT_START_NO_PRODUCT), CHAT_START_NO_PRODUCT)
    assert.equal(chatStartFailureLine(CHAT_START_UNAUTHORIZED), CHAT_START_UNAUTHORIZED)
    assert.equal(chatStartFailureLine('已有任务在运行，请稍候或先中止'), CHAT_START_ALREADY_RUNNING)
    assert.equal(
      chatStartFailureLine('画像未就绪（draft）。缺失：公司名'),
      '任务没有启动：画像未就绪（draft）。缺失：公司名',
    )
    assert.equal(resolveChatProductId(null, ' prd_current '), 'prd_current')
    assert.equal(resolveChatProductId('prd_explicit', 'prd_current'), 'prd_explicit')
    assert.equal(resolveChatProductId('  ', ''), '')
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
