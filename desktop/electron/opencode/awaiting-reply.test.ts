import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AWAITING_REPLY_SUBMIT_FAILED_MESSAGE,
  AWAITING_REPLY_TIMEOUT_MS,
  AWAITING_REPLY_TIMELINE_ALREADY_DONE,
  AWAITING_REPLY_TIMELINE_SUBMITTED,
  AWAITING_REPLY_TIMELINE_TIMEOUT_MULTI,
  AWAITING_REPLY_TIMELINE_TIMEOUT_REJECTED,
  AwaitingReplyCoordinator,
  type AwaitingQuestionClient,
  type AwaitingReplyHooks,
  type AwaitingReplyView,
  type QuestionSideResult,
  assessQuestionRequest,
  awaitingReplyTimeoutSingleTimeline,
  buildQuestionAnswers,
  buildV1QuestionReplyCall,
  buildV2QuestionRejectCall,
  buildV2QuestionReplyCall,
  classifyQuestionHttpResult,
  decideAwaitingReplyTimeout,
  formatQuestionToolCard,
  resolveAwaitingReplyTimeoutMs,
} from './awaiting-reply'

function question(
  header: string,
  labels: string[],
  extra: Record<string, unknown> = {},
) {
  return {
    header,
    question: `题干 ${header}`,
    options: labels.map((label) => ({ label, description: `${label} 说明` })),
    ...extra,
  }
}

function selection(optionLabels: string[], customText = '') {
  return { selections: [{ optionLabels, customText }] }
}

describe('resolveAwaitingReplyTimeoutMs', () => {
  it('默认 10 分钟', () => {
    assert.equal(AWAITING_REPLY_TIMEOUT_MS, 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs(undefined), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs(''), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('   '), 600_000)
  })

  it('正整数毫秒覆盖，非法值回退', () => {
    assert.equal(resolveAwaitingReplyTimeoutMs('1000'), 1000)
    assert.equal(resolveAwaitingReplyTimeoutMs(' 1500 '), 1500)
    assert.equal(resolveAwaitingReplyTimeoutMs('0'), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('-5'), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('abc'), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('1.5'), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('+1000'), 600_000)
    assert.equal(resolveAwaitingReplyTimeoutMs('12abc'), 600_000)
  })
})

describe('decideAwaitingReplyTimeout', () => {
  it('不可渲染或空题拒绝', () => {
    assert.deepEqual(decideAwaitingReplyTimeout({ renderable: false, questions: [] }), {
      action: 'reject',
      reason: 'unrenderable',
    })
    assert.deepEqual(
      decideAwaitingReplyTimeout({
        renderable: true,
        questions: [],
      }),
      { action: 'reject', reason: 'unrenderable' },
    )
  })

  it('任一题 multiple 整单拒绝，优先于无选项', () => {
    assert.deepEqual(
      decideAwaitingReplyTimeout({
        renderable: true,
        questions: [
          { multiple: true, options: [] },
          { options: [{ label: '继续' }] },
        ],
      }),
      { action: 'reject', reason: 'multiple' },
    )
  })

  it('首项 label 为空则拒绝', () => {
    assert.deepEqual(
      decideAwaitingReplyTimeout({
        renderable: true,
        questions: [{ options: [{ label: '  ' }, { label: '后一项' }] }],
      }),
      { action: 'reject', reason: 'no-options' },
    )
    assert.deepEqual(
      decideAwaitingReplyTimeout({
        renderable: true,
        questions: [{ options: [] }],
      }),
      { action: 'reject', reason: 'no-options' },
    )
  })

  it('每题取首项 label，有自定义输入仍回复', () => {
    assert.deepEqual(
      decideAwaitingReplyTimeout({
        renderable: true,
        questions: [
          { options: [{ label: '继续' }, { label: '停止' }] },
          { options: [{ label: '第一' }] },
        ],
      }),
      { action: 'reply', answers: [['继续'], ['第一']] },
    )
  })
})

describe('buildQuestionAnswers', () => {
  const single = [{ options: [{ label: '继续' }, { label: '收尾' }], custom: false }]
  const multi = [
    {
      multiple: true,
      custom: true,
      options: [{ label: '甲' }, { label: '乙' }, { label: '丙' }],
    },
  ]

  it('单选回传 label', () => {
    assert.deepEqual(buildQuestionAnswers(single, [{ optionLabels: ['收尾'], customText: '' }]), {
      ok: true,
      answers: [['收尾']],
    })
  })

  it('多选按选项原序，自定义文本附在末尾', () => {
    assert.deepEqual(
      buildQuestionAnswers(multi, [{ optionLabels: ['丙', '甲'], customText: ' 补充 ' }]),
      { ok: true, answers: [['甲', '丙', '补充']] },
    )
  })

  it('单选自定义文本优先，并去掉空白', () => {
    assert.deepEqual(
      buildQuestionAnswers([{ options: [{ label: '甲' }], custom: true }], [
        { optionLabels: ['不存在'], customText: '  自己写  ' },
      ]),
      { ok: true, answers: [['自己写']] },
    )
  })

  it('未开自定义时忽略输入，非法 label 不发答案', () => {
    assert.deepEqual(
      buildQuestionAnswers(single, [{ optionLabels: ['继续'], customText: '偷偷写' }]),
      { ok: true, answers: [['继续']] },
    )
    assert.deepEqual(buildQuestionAnswers(single, [{ optionLabels: ['没有'], customText: '' }]), {
      ok: false,
    })
    assert.deepEqual(buildQuestionAnswers(single, [{ optionLabels: [], customText: '' }]), {
      ok: false,
    })
    assert.deepEqual(
      buildQuestionAnswers(single, [
        { optionLabels: ['继续'], customText: '' },
        { optionLabels: ['收尾'], customText: '' },
      ]),
      { ok: false },
    )
  })

  it('选中 label 与去空白后的选项一致，答案用选项原文', () => {
    assert.deepEqual(
      buildQuestionAnswers([{ options: [{ label: ' 继续 ' }] }], [
        { optionLabels: ['继续'], customText: '' },
      ]),
      { ok: true, answers: [[' 继续 ']] },
    )
  })
})

describe('assessQuestionRequest', () => {
  it('custom 缺省为 false，空说明仍可渲染', () => {
    const assessed = assessQuestionRequest([
      { header: ' 范围 ', question: ' 怎么继续 ', options: [{ label: '甲', description: '' }] },
    ])
    assert.equal(assessed.renderable, true)
    assert.equal(assessed.questions[0]?.custom, false)
    assert.equal(assessed.questions[0]?.multiple, false)
    assert.equal(assessed.questions[0]?.header, '范围')
  })

  it('空选项且没有自定义、缺说明、空标题都不可渲染', () => {
    assert.equal(
      assessQuestionRequest([{ header: 'H', question: 'Q', options: [] }]).renderable,
      false,
    )
    assert.equal(
      assessQuestionRequest([
        { header: 'H', question: 'Q', options: [{ label: '甲' }] },
      ]).renderable,
      false,
    )
    assert.equal(
      assessQuestionRequest([
        { header: '  ', question: 'Q', options: [{ label: '甲', description: 'd' }] },
      ]).renderable,
      false,
    )
  })

  it('只有自定义输入时可渲染', () => {
    const assessed = assessQuestionRequest([
      { header: 'H', question: 'Q', custom: true, options: [] },
    ])
    assert.equal(assessed.renderable, true)
    assert.equal(assessed.questions[0]?.custom, true)
    assert.deepEqual(assessed.questions[0]?.options, [])
  })
})

describe('formatQuestionToolCard', () => {
  it('提问工具改标题且预览不用原始 JSON', () => {
    assert.deepEqual(formatQuestionToolCard(' Question ', 'running'), {
      title: '等待回复',
      body: '等待你的选择',
      collapsed: true,
    })
    assert.equal(formatQuestionToolCard('question.v2', 'done')?.title, '等待回复 · 完成')
    assert.equal(formatQuestionToolCard('QUESTION.ask', 'error')?.title, '等待回复 · 失败')
    assert.equal(formatQuestionToolCard('questions', 'running'), null)
    assert.equal(formatQuestionToolCard('read', 'done'), null)
  })
})

describe('协议调用形状与 HTTP 归类', () => {
  it('v2 必须包 questionV2Reply', () => {
    const call = buildV2QuestionReplyCall('sess', 'req', [['立即收尾并评分']])
    assert.deepEqual(call, {
      sessionID: 'sess',
      requestID: 'req',
      questionV2Reply: { answers: [['立即收尾并评分']] },
    })
    assert.equal(Object.prototype.hasOwnProperty.call(call, 'answers'), false)
    assert.deepEqual(buildV1QuestionReplyCall('req', [['甲']]), {
      requestID: 'req',
      answers: [['甲']],
    })
    assert.deepEqual(buildV2QuestionRejectCall('sess', 'req'), {
      sessionID: 'sess',
      requestID: 'req',
    })
  })

  it('404 与 v1 body false', () => {
    assert.equal(
      classifyQuestionHttpResult({
        error: { _tag: 'QuestionNotFoundError' },
        data: undefined,
        status: 404,
        protocol: 'v1',
      }),
      'not-found',
    )
    assert.equal(
      classifyQuestionHttpResult({ error: undefined, data: false, status: 200, protocol: 'v1' }),
      'failed',
    )
    assert.equal(
      classifyQuestionHttpResult({ error: undefined, data: true, status: 200, protocol: 'v1' }),
      'ok',
    )
    assert.equal(
      classifyQuestionHttpResult({ error: undefined, data: undefined, status: 204, protocol: 'v2' }),
      'ok',
    )
    assert.equal(
      classifyQuestionHttpResult({ error: { message: 'no' }, data: undefined, status: 500, protocol: 'v2' }),
      'failed',
    )
  })
})

type Timer = { ms: number; cb: () => void; cleared: boolean }

function harness() {
  const emits: Array<AwaitingReplyView | null> = []
  const lines: string[] = []
  const logs: Array<{ requestIds: string[]; sessionId: string; reason: string }> = []
  const timers: Timer[] = []
  let created = 0
  let cleared = 0
  const calls: string[] = []
  const client: AwaitingQuestionClient = {
    replyV1: async (requestID, answers) => {
      calls.push(`replyV1:${requestID}:${JSON.stringify(answers)}`)
      return 'ok'
    },
    replyV2: async (sessionID, requestID, answers) => {
      calls.push(`replyV2:${sessionID}:${requestID}:${JSON.stringify(answers)}`)
      return 'ok'
    },
    rejectV1: async (requestID) => {
      calls.push(`rejectV1:${requestID}`)
      return 'ok'
    },
    rejectV2: async (sessionID, requestID) => {
      calls.push(`rejectV2:${sessionID}:${requestID}`)
      return 'ok'
    },
  }
  const hooks: AwaitingReplyHooks = {
    timeoutMs: () => 600_000,
    schedule: (ms, cb) => {
      const timer: Timer = { ms, cb, cleared: false }
      timers.push(timer)
      return {
        clear: () => {
          timer.cleared = true
        },
      }
    },
    emit: (pending) => {
      emits.push(pending)
    },
    timeline: (body) => {
      lines.push(body)
    },
    logReject: (info) => {
      logs.push(info)
    },
    client: () => client,
    performSessionAbort: async () => {
      calls.push('session-abort')
    },
    onSlotCreated: () => {
      created += 1
    },
    onSlotCleared: () => {
      cleared += 1
    },
  }
  const coord = new AwaitingReplyCoordinator(hooks)
  return { coord, emits, lines, logs, timers, calls, client, hooks, created: () => created, cleared: () => cleared }
}

describe('AwaitingReplyCoordinator', () => {
  it('只收 v1 或只收 v2 都进入等待，并槽不重置计时', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'v1-id', [question('范围', ['继续', '收尾'])])
    assert.equal(h.timers.length, 1)
    assert.equal(h.timers[0]?.ms, 600_000)
    assert.equal(h.emits.at(-1)?.renderable, true)
    assert.equal(h.emits.at(-1)?.questions[0]?.header, '范围')
    assert.equal(h.created(), 1)

    await h.coord.ingest('s1', 'v2', 'v2-id', [
      question('范围', ['继续', '收尾'], { custom: false }),
    ])
    assert.equal(h.timers.length, 1)
    assert.equal(h.timers[0]?.cleared, false)
    assert.equal(h.created(), 1)

    const result = await h.coord.reply(selection(['收尾']))
    assert.deepEqual(result, { ok: true, message: '' })
    assert.equal(h.calls.filter((call) => call.startsWith('reply')).length, 2)
    assert.ok(h.calls.includes('replyV1:v1-id:[["收尾"]]'))
    assert.ok(h.calls.includes('replyV2:s1:v2-id:[["收尾"]]'))
    assert.equal(h.calls.includes('session-abort'), false)
    assert.equal(h.lines.at(-1), AWAITING_REPLY_TIMELINE_SUBMITTED)
    assert.equal(h.emits.at(-1), null)

    const again = await h.coord.reply(selection(['收尾']))
    assert.deepEqual(again, { ok: false, message: '' })
    assert.equal(h.calls.filter((call) => call.startsWith('reply')).length, 2)
  })

  it('只到达 v2 时走 v2 回复', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v2', 'only-v2', [question('范围', ['立即收尾并评分'])])
    const result = await h.coord.reply(selection(['立即收尾并评分']))
    assert.equal(result.ok, true)
    assert.deepEqual(h.calls, ['replyV2:s1:only-v2:[["立即收尾并评分"]]'])
  })

  it('内容不同先拒绝旧题再重新计时', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'old', [question('旧', ['甲'])])
    await h.coord.ingest('s1', 'v1', 'new', [question('新', ['乙'])])
    assert.equal(h.timers[0]?.cleared, true)
    assert.equal(h.timers.length, 2)
    assert.equal(h.created(), 2)
    assert.ok(h.calls.includes('rejectV1:old'))
    assert.equal(h.emits.at(-1)?.questions[0]?.header, '新')
  })

  it('答案不完整不发 HTTP，连点只回复一次', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲', '乙'])])
    const incomplete = await h.coord.reply(selection([]))
    assert.deepEqual(incomplete, { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE })
    assert.equal(h.calls.length, 0)

    let release: (value: QuestionSideResult) => void = () => undefined
    h.client.replyV1 = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const first = h.coord.reply(selection(['甲']))
    await Promise.resolve()
    const second = h.coord.reply(selection(['乙']))
    release('ok')
    const [a, b] = await Promise.all([first, second])
    assert.equal(a.ok, true)
    assert.deepEqual(b, { ok: false, message: '' })
  })

  it('404 清槽且不显示提交失败句', async () => {
    const h = harness()
    h.client.replyV1 = async () => 'not-found'
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲'])])
    const result = await h.coord.reply(selection(['甲']))
    assert.equal(result.ok, true)
    assert.equal(h.lines.at(-1), AWAITING_REPLY_TIMELINE_ALREADY_DONE)
    assert.equal(h.emits.at(-1), null)
  })

  it('非 404 失败保留卡片', async () => {
    const h = harness()
    h.client.replyV1 = async () => 'failed'
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲'])])
    const result = await h.coord.reply(selection(['甲']))
    assert.deepEqual(result, { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE })
    assert.equal(h.emits.at(-1)?.renderable, true)
    assert.equal(h.logs.at(-1)?.reason, 'send-failed')
    const retry = await h.coord.reply(selection(['甲']))
    assert.equal(retry.ok, false)
  })

  it('结束只 reject，不在协调器里中止会话', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v2', 'id', [question('范围', ['甲'])])
    await h.coord.endForAbort()
    assert.deepEqual(h.calls, ['rejectV2:s1:id'])
    assert.equal(h.emits.at(-1), null)
  })

  it('不可渲染进入槽，到期按 unrenderable 拒绝且不中止会话', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'id', [{ header: '', question: '', options: [] }])
    assert.deepEqual(h.emits.at(-1), { questions: [], renderable: false })
    h.timers[0]?.cb()
    await h.coord.whenIdle()
    assert.equal(h.logs[0]?.reason, 'unrenderable')
    assert.ok(h.calls.includes('rejectV1:id'))
    assert.equal(h.calls.includes('session-abort'), false)
    assert.equal(h.lines.at(-1), AWAITING_REPLY_TIMELINE_TIMEOUT_REJECTED)
  })

  it('到期对非多选回复首项且不中止会话', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['先做这个', '别的'])])
    h.timers[0]?.cb()
    await h.coord.whenIdle()
    assert.ok(h.calls.includes('replyV1:id:[["先做这个"]]'))
    assert.equal(h.calls.includes('session-abort'), false)
    assert.equal(h.lines.at(-1), awaitingReplyTimeoutSingleTimeline('先做这个'))
    assert.equal(h.emits.at(-1), null)
  })

  it('多题到期用每题第一项的文案', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'id', [question('一', ['A']), question('二', ['B'])])
    h.timers[0]?.cb()
    await h.coord.whenIdle()
    assert.ok(h.calls.includes('replyV1:id:[["A"],["B"]]'))
    assert.equal(h.lines.at(-1), AWAITING_REPLY_TIMELINE_TIMEOUT_MULTI)
  })

  it('多选或仅自定义到期只拒绝', async () => {
    const multiple = harness()
    await multiple.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲', '乙'], { multiple: true })])
    multiple.timers[0]?.cb()
    await multiple.coord.whenIdle()
    assert.equal(multiple.logs[0]?.reason, 'multiple')
    assert.ok(multiple.calls.includes('rejectV1:id'))
    assert.equal(multiple.calls.includes('session-abort'), false)

    const customOnly = harness()
    await customOnly.coord.ingest('s1', 'v2', 'id', [
      { header: 'H', question: 'Q', custom: true, options: [] },
    ])
    customOnly.timers[0]?.cb()
    await customOnly.coord.whenIdle()
    assert.equal(customOnly.logs[0]?.reason, 'no-options')
    assert.ok(customOnly.calls.includes('rejectV2:s1:id'))
    assert.equal(customOnly.calls.includes('session-abort'), false)
  })

  it('自动回复失败转入结束，先拒绝再标记中止', async () => {
    const h = harness()
    const order: string[] = []
    h.client.replyV1 = async () => {
      order.push('reply')
      return 'failed'
    }
    h.client.rejectV1 = async () => {
      order.push('reject')
      return 'ok'
    }
    h.hooks.performSessionAbort = async () => {
      await h.coord.endForAbort()
      order.push('session-abort')
    }
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲'])])
    h.timers[0]?.cb()
    await h.coord.whenIdle()
    assert.deepEqual(order, ['reply', 'reject', 'session-abort'])
  })

  it('提交失败且计时已到，返回后立即按超时处理', async () => {
    const h = harness()
    let attempts = 0
    let release: (value: QuestionSideResult) => void = () => undefined
    h.client.replyV1 = () => {
      attempts += 1
      if (attempts === 1) {
        return new Promise((resolve) => {
          release = resolve
        })
      }
      return Promise.resolve('ok')
    }
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲', '乙'])])
    const pending = h.coord.reply(selection(['乙']))
    await Promise.resolve()
    h.timers[0]?.cb()
    release('failed')
    const result = await pending
    await h.coord.whenIdle()
    assert.deepEqual(result, { ok: false, message: '' })
    assert.equal(attempts, 2)
    assert.equal(h.lines.at(-1), awaitingReplyTimeoutSingleTimeline('甲'))
    assert.equal(h.calls.includes('session-abort'), false)
  })

  it('任务结束后迟到的计时不再回复', async () => {
    const h = harness()
    await h.coord.ingest('s1', 'v1', 'id', [question('范围', ['甲'])])
    const fire = h.timers[0]?.cb
    h.coord.dispose()
    fire?.()
    await h.coord.whenIdle()
    assert.equal(h.calls.length, 0)
    assert.equal(h.emits.at(-1), null)
  })
})
