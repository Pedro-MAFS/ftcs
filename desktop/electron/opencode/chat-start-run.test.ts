import { electronMockReady } from './register-electron-mock.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import type { AgentEventPayload, AgentTimelineItem } from './agent-runner.ts'
import {
  CHAT_START_ALREADY_RUNNING,
  CHAT_START_BAD_STEP,
  CHAT_START_CANCELLED,
  CHAT_START_NO_PRODUCT,
  CHAT_START_USE_SKILL,
  FTCS_TASK_REJECT_MESSAGE,
} from './chat-start-task.ts'
import { FREE_DIALOGUE_STOPPED } from './free-dialogue.ts'

const agent = electronMockReady ? await import('./agent-runner.ts') : null
const AgentRunController = agent?.AgentRunController ?? null

type QueueEvent = Record<string, unknown>

function createEventStream() {
  const queue: QueueEvent[] = []
  let pending: ((result: IteratorResult<QueueEvent>) => void) | null = null
  let closed = false
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<QueueEvent>> {
          if (queue.length > 0) {
            const value = queue.shift()!
            return Promise.resolve({ value, done: false })
          }
          if (closed) return Promise.resolve({ value: undefined as unknown as QueueEvent, done: true })
          return new Promise((resolve) => {
            pending = resolve
          })
        },
      }
    },
  }
  return {
    stream,
    push(event: QueueEvent) {
      if (closed) return
      if (pending) {
        const resolve = pending
        pending = null
        resolve({ value: event, done: false })
      } else {
        queue.push(event)
      }
    },
    close() {
      closed = true
      if (pending) {
        const resolve = pending
        pending = null
        resolve({ value: undefined as unknown as QueueEvent, done: true })
      }
    },
  }
}

function timelineItems(events: AgentEventPayload[]): AgentTimelineItem[] {
  const last = [...events].reverse().find((event) => event.type === 'timeline')
  return last && last.type === 'timeline' ? last.items : []
}

function toolEvent(sessionId: string, partId: string, output: unknown, status: 'completed' | 'error' = 'completed') {
  return {
    type: 'message.part.updated',
    properties: {
      sessionID: sessionId,
      part: {
        id: partId,
        messageID: `msg-${partId}`,
        type: 'tool',
        tool: 'ftcs-task_start_task',
        state:
          status === 'completed'
            ? { status, input: {}, output }
            : { status, error: typeof output === 'string' ? output : JSON.stringify(output) },
      },
    },
  }
}

function startQuestions(productId: string, options?: { includeChannel?: boolean }) {
  const questions: Array<Record<string, unknown>> = [
    {
      header: '产品',
      question: '选一个产品',
      custom: false,
      options: [
        { label: productId, description: 'Acme' },
        { label: 'prd_other', description: '未命名' },
      ],
    },
    {
      header: '阶段',
      question: '选一个阶段',
      custom: false,
      options: [
        { label: 'keywords', description: '扩展关键词' },
        { label: 'explore', description: '探索' },
        { label: 'score', description: '评分去重' },
        { label: 'email', description: '起草待处理线索' },
        { label: 'profile', description: '画像' },
      ],
    },
  ]
  if (options?.includeChannel !== false) {
    questions.push({
      header: '渠道',
      question: '选一个渠道',
      custom: false,
      options: [
        { label: 'r1', description: '全网搜索' },
        { label: 'r2', description: '社媒发现' },
        { label: 'r3', description: '地图发现' },
      ],
    })
  }
  return questions
}

function questionEvent(sessionId: string, questions: unknown, id = 'q_start') {
  return {
    type: 'question.asked',
    properties: {
      id,
      sessionID: sessionId,
      questions,
    },
  }
}

function replySelections(labels: string[]) {
  return {
    selections: labels.map((label) => ({ optionLabels: [label], customText: '' })),
  }
}

const previousWorkspace = process.env.FTCS_WORKSPACE
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-fd03-'))
process.env.FTCS_WORKSPACE = workspaceRoot

function writeProfile(productId: string, status: 'ready' | 'draft'): void {
  const dir = path.join(workspaceRoot, 'data', 'products', productId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'profile.json'),
    JSON.stringify({
      id: productId,
      status,
      company: { name: 'Acme' },
      products: [{ name: 'Widget' }],
      readiness: { score: status === 'ready' ? 80 : 10, missing_fields: status === 'ready' ? [] : ['公司名'] },
    }),
    'utf8',
  )
}

after(() => {
  if (previousWorkspace == null) delete process.env.FTCS_WORKSPACE
  else process.env.FTCS_WORKSPACE = previousWorkspace
  fs.rmSync(workspaceRoot, { recursive: true, force: true })
})

const describeRun = electronMockReady && AgentRunController ? describe : describe.skip

describeRun('chat start task', () => {
  function harness(options?: { failCreate?: boolean; holdChat?: boolean }) {
    const chatId = 'ses_chat'
    const taskId = 'ses_task'
    const streams: Array<ReturnType<typeof createEventStream>> = []
    const creates: Array<{ title?: string }> = []
    const aborts: string[] = []
    const replies: unknown[] = []
    const questionReplies: unknown[] = []
    const questionRejects: string[] = []
    const order: string[] = []
    let releaseCreate: (() => void) | null = null
    let enteredCreate: (() => void) | null = null
    const createEntered = new Promise<void>((resolve) => {
      enteredCreate = resolve
    })
    let releaseIdle: (() => void) | null = null
    const closers: Array<() => void> = []

    const push = (event: QueueEvent) => {
      for (const stream of streams) stream.push(event)
    }

    const client = {
      session: {
        async create(input: { title?: string }) {
          creates.push(input)
          if (input.title === '自由对话') return { data: { id: chatId } }
          order.push('create-start')
          enteredCreate?.()
          if (options?.failCreate) {
            order.push('create-end')
            return { error: { message: '创建 OpenCode 会话失败' } }
          }
          await new Promise<void>((resolve) => {
            releaseCreate = resolve
          })
          order.push('create-end')
          return { data: { id: taskId } }
        },
        async promptAsync() {
          return {}
        },
        async abort(input: { sessionID?: string }) {
          const id = input.sessionID ?? ''
          aborts.push(id)
          order.push(`abort:${id}`)
          return {}
        },
        async status() {
          return { data: {} }
        },
      },
      permission: {
        async reply(input: unknown) {
          replies.push(input)
          return { data: true, response: { status: 200 } }
        },
      },
      question: {
        async reply(input: unknown) {
          questionReplies.push(input)
          return { data: true, error: undefined, response: { status: 200 } }
        },
        async reject(input: { requestID?: string }) {
          questionRejects.push(input.requestID ?? '')
          return { data: true, error: undefined, response: { status: 200 } }
        },
      },
      event: {
        async subscribe() {
          const api = createEventStream()
          streams.push(api)
          closers.push(() => api.close())
          return { stream: api.stream }
        },
      },
      v2: {
        session: {
          async wait(input: { sessionID?: string }) {
            if (input.sessionID === chatId) {
              push({
                type: 'message.updated',
                properties: { sessionID: chatId, info: { id: 'msg_a', role: 'assistant' } },
              })
              push({
                type: 'message.part.updated',
                properties: {
                  sessionID: chatId,
                  part: { id: 'part_a', messageID: 'msg_a', type: 'text', text: 'FOB 是装运港船上交货。' },
                },
              })
              if (options?.holdChat) {
                await new Promise<void>((resolve) => {
                  releaseIdle = resolve
                })
              } else {
                await new Promise((resolve) => setTimeout(resolve, 20))
              }
            }
            return { response: { status: 204 } }
          },
          question: {
            async reply(input: unknown) {
              questionReplies.push(input)
              return { data: undefined, error: undefined, response: { status: 204 } }
            },
            async reject(input: { requestID?: string }) {
              questionRejects.push(input.requestID ?? '')
              return { data: undefined, error: undefined, response: { status: 204 } }
            },
          },
        },
      },
    }

    const runner = new AgentRunController(() => client as never, {
      async preflight() {
        return { ok: true, message: '环境检查通过' }
      },
    })
    const emitted: AgentEventPayload[] = []
    const emit = (payload: AgentEventPayload) => {
      emitted.push(payload)
    }

    return {
      runner,
      emit,
      emitted,
      creates,
      aborts,
      replies,
      questionReplies,
      questionRejects,
      order,
      push,
      createEntered,
      releaseCreate: () => releaseCreate?.(),
      releaseIdle: () => releaseIdle?.(),
      close: () => {
        for (const close of closers) close()
      },
      chatId,
      taskId,
    }
  }

  async function chat(env: ReturnType<typeof harness>, text = '用一句话说明什么是 FOB') {
    const result = await env.runner.sendFreeDialogue(text, env.emit)
    assert.equal(result.ok, true)
    assert.equal(env.runner.isRunning(), false)
    return result
  }

  async function showStartCard(
    env: ReturnType<typeof harness>,
    productId: string,
    options?: { includeChannel?: boolean; id?: string },
  ) {
    env.push(questionEvent(env.chatId, startQuestions(productId, options), options?.id ?? 'q_start'))
    assert.equal(
      await waitFor(() =>
        env.emitted.some(
          (event) => event.type === 'awaiting-reply' && event.pending != null && event.pending.renderable,
        ),
      ),
      true,
    )
    assert.equal(env.runner.isRunning(), false)
    assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), false)
  }

  it('keeps the chat when the stage cannot be started', async () => {
    const env = harness()
    try {
      await chat(env)
      await showStartCard(env, 'prd_ready')
      const reply = await env.runner.replyToPendingQuestion(replySelections(['prd_ready', 'profile', 'r1']))
      assert.equal(reply.ok, true)
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body === CHAT_START_BAD_STEP)), true)
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === CHAT_START_BAD_STEP), true)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.creates.some((item) => item.title?.includes('expand-keywords')), false)
      assert.equal(env.emitted.some((event) => event.type === 'state'), false)
    } finally {
      env.close()
    }
  })

  it('keeps the chat when the product id is not in the sidebar list', async () => {
    writeProfile('prd_real', 'ready')
    const env = harness()
    try {
      await chat(env)
      env.runner.noteActiveProduct('prd_real')
      await showStartCard(env, 'prd_missing')
      const reply = await env.runner.replyToPendingQuestion(replySelections(['prd_missing', 'keywords', 'r1']))
      assert.equal(reply.ok, true)
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body === CHAT_START_NO_PRODUCT)), true)
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === CHAT_START_NO_PRODUCT), true)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
    } finally {
      env.close()
    }
  })

  it('appends the existing readiness reason and does not start', async () => {
    writeProfile('prd_draft', 'draft')
    const env = harness()
    try {
      await chat(env)
      await showStartCard(env, 'prd_draft')
      await env.runner.replyToPendingQuestion(replySelections(['prd_draft', 'keywords', 'r2']))
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('画像未就绪'))),
        true,
      )
      const items = timelineItems(env.emitted)
      const notice = items.find((item) => item.body.startsWith('任务没有启动：'))
      assert.equal(notice?.body.includes('画像未就绪'), true)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === '未授权，任务未启动。'), false)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.aborts.includes(env.chatId), false)
    } finally {
      env.close()
    }
  })

  it('rejects ftcs-task without a permission card and does not launch', async () => {
    writeProfile('prd_ready_task', 'ready')
    const env = harness()
    try {
      await chat(env)
      env.push({
        type: 'permission.asked',
        properties: {
          id: 'req_start',
          sessionID: env.chatId,
          permission: 'ftcs-task_start_task',
        },
      })
      env.push(
        toolEvent(env.chatId, 'tool_start', { ok: true, stage: 'keywords', product_id: 'prd_ready_task' }, 'error'),
      )
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body === CHAT_START_USE_SKILL)),
        true,
      )
      const items = timelineItems(env.emitted)
      assert.equal(items.filter((item) => item.body === CHAT_START_USE_SKILL).length, 1)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === '未授权，任务未启动。'), false)
      assert.equal(
        env.emitted.some((event) => event.type === 'permission-ask' && event.pending != null),
        false,
      )
      assert.equal(env.replies.length, 1)
      assert.deepEqual(env.replies[0], {
        requestID: 'req_start',
        reply: 'reject',
        message: FTCS_TASK_REJECT_MESSAGE,
      })
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.runner.isRunning(), false)
    } finally {
      env.close()
    }
  })

  it('does not launch when ftcs-task completes without a permission event', async () => {
    writeProfile('prd_ready_direct', 'ready')
    const env = harness()
    try {
      await chat(env)
      env.push(
        toolEvent(env.chatId, 'tool_direct', { ok: true, stage: 'keywords', product_id: 'prd_ready_direct' }),
      )
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body === CHAT_START_USE_SKILL)),
        true,
      )
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.emitted.some((event) => event.type === 'permission-ask' && event.pending != null), false)
    } finally {
      env.close()
    }
  })

  it('does not clear the chat when session.create fails', async () => {
    writeProfile('prd_ready_fail', 'ready')
    const env = harness({ failCreate: true })
    try {
      await chat(env)
      await showStartCard(env, 'prd_ready_fail')
      await env.runner.replyToPendingQuestion(replySelections(['prd_ready_fail', 'keywords', 'r1']))
      assert.equal(
        await waitFor(() =>
          timelineItems(env.emitted).some(
            (item) => item.body.includes('任务没有启动：') && item.body.includes('创建 OpenCode 会话失败'),
          ),
        ),
        true,
      )
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body.includes('未授权')), false)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.aborts.includes(env.chatId), false)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), false)
    } finally {
      env.close()
    }
  })

  it('replaces the timeline only after create, then ignores a second start', async () => {
    writeProfile('prd_ready', 'ready')
    const env = harness()
    try {
      await chat(env)
      await showStartCard(env, 'prd_ready')
      await env.runner.replyToPendingQuestion(replySelections(['prd_ready', 'keywords', 'r2']))
      await env.createEntered
      assert.equal(env.runner.isRunning(), false)
      assert.equal(timelineItems(env.emitted).some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), false)
      assert.equal(env.aborts.includes(env.chatId), false)
      assert.equal(env.creates.some((item) => item.title?.startsWith('discover-leads')), false)
      env.releaseCreate()
      const replaced = await waitFor(async () => {
        const items = timelineItems(env.emitted)
        return items.some((item) => item.id === 'sys-session' && item.body.includes(env.taskId))
      })
      assert.equal(replaced, true)
      const taskItems = timelineItems(env.emitted)
      assert.equal(taskItems.some((item) => item.body.includes('什么是 FOB')), false)
      assert.equal(taskItems.some((item) => item.id === 'sys-session' && item.body.includes('已创建 OpenCode session')), true)
      assert.equal(env.creates.some((item) => item.title === 'expand-keywords · prd_ready'), true)
      assert.equal(env.runner.isRunning(), true)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), true)
      assert.ok(env.order.indexOf('create-end') >= 0)
      assert.ok(env.order.indexOf('create-end') < env.order.indexOf(`abort:${env.chatId}`))

      const before = env.emitted.length
      env.push({
        type: 'permission.asked',
        properties: {
          id: 'req_second',
          sessionID: env.taskId,
          permission: 'ftcs-task_start_task',
        },
      })
      env.push(questionEvent(env.taskId, startQuestions('prd_ready'), 'q_again'))
      env.push(toolEvent(env.taskId, 'tool_again', { ok: true, stage: 'keywords', product_id: 'prd_ready' }))
      assert.equal(await waitFor(() => env.replies.length === 1 && env.questionRejects.includes('q_again')), true)
      await new Promise((resolve) => setTimeout(resolve, 40))
      assert.equal(env.creates.filter((item) => item.title?.startsWith('expand-keywords')).length, 1)
      assert.equal(
        env.emitted.some(
          (event) => event.type === 'permission-ask' && event.pending?.permission === 'ftcs-task_start_task',
        ),
        false,
      )
      const added = env.emitted.slice(before)
      assert.equal(
        added.some((event) => event.type === 'awaiting-reply' && event.pending != null),
        false,
      )
      assert.equal(timelineItems(env.emitted).some((item) => item.body === CHAT_START_ALREADY_RUNNING), false)
      assert.equal(timelineItems(env.emitted).some((item) => item.body === CHAT_START_USE_SKILL), false)
    } finally {
      await env.runner.abortCurrent()
      env.close()
    }
  })

  it('cancel on the start card appends the cancel line and does not start', async () => {
    const env = harness({ holdChat: true })
    try {
      const pending = env.runner.sendFreeDialogue('用一句话说明什么是 FOB', env.emit)
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('什么是 FOB'))),
        true,
      )
      await new Promise((resolve) => setTimeout(resolve, 30))
      await showStartCard(env, 'prd_ready')
      await env.runner.abortCurrent()
      env.releaseIdle()
      const result = await pending
      assert.equal(result.ok, true)
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body === CHAT_START_CANCELLED), true)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === FREE_DIALOGUE_STOPPED), false)
      assert.equal(items.some((item) => item.body === '未授权，任务未启动。'), false)
      assert.equal(env.questionRejects.includes('q_start'), true)
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.runner.isRunning(), false)
    } finally {
      env.close()
    }
  })

  it('submitting the start card after a button start does not launch a second task', async () => {
    writeProfile('prd_button_open', 'ready')
    const env = harness({ holdChat: true })
    try {
      const chatPending = env.runner.sendFreeDialogue('用一句话说明什么是 FOB', env.emit)
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('什么是 FOB'))),
        true,
      )
      await new Promise((resolve) => setTimeout(resolve, 30))
      await showStartCard(env, 'prd_button_open')
      const taskPending = env.runner.runExpandKeywords('prd_button_open', env.emit)
      await env.createEntered
      assert.equal(env.runner.isRunning(), true)
      const awaiting = [...env.emitted].reverse().find((event) => event.type === 'awaiting-reply')
      assert.equal(awaiting?.type === 'awaiting-reply' && awaiting.pending != null, true)
      const reply = await env.runner.replyToPendingQuestion(
        replySelections(['prd_button_open', 'keywords', 'r1']),
      )
      assert.equal(reply.ok, true)
      assert.equal(
        timelineItems(env.emitted).some((item) => item.body === CHAT_START_ALREADY_RUNNING),
        true,
      )
      assert.equal(env.creates.filter((item) => item.title?.startsWith('expand-keywords')).length, 1)
      env.releaseCreate()
      env.releaseIdle()
      await chatPending
      await env.runner.abortCurrent()
      await taskPending
      assert.equal(env.creates.filter((item) => item.title?.startsWith('expand-keywords')).length, 1)
    } finally {
      env.close()
    }
  })

  it('button start still publishes the task timeline before create returns', async () => {
    writeProfile('prd_button', 'ready')
    const env = harness()
    try {
      let sawTimelineBeforeCreate = false
      let sawRunningBeforeCreate = false
      const pending = env.runner.runExpandKeywords('prd_button', (payload) => {
        if (!env.order.includes('create-end')) {
          if (payload.type === 'timeline') sawTimelineBeforeCreate = true
          if (payload.type === 'state' && payload.status === 'running') sawRunningBeforeCreate = true
        }
        env.emit(payload)
      })
      await env.createEntered
      assert.equal(env.runner.isRunning(), true)
      assert.equal(sawTimelineBeforeCreate, true)
      assert.equal(sawRunningBeforeCreate, true)
      env.releaseCreate()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await env.runner.abortCurrent()
      await pending
    } finally {
      env.close()
    }
  })

  it('routes score, explore and email through the existing checks', async () => {
    writeProfile('prd_route', 'ready')
    const env = harness()
    try {
      await chat(env)
      await showStartCard(env, 'prd_route', { id: 'q_score' })
      await env.runner.replyToPendingQuestion(replySelections(['prd_route', 'score', 'r1']))
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('暂无原始线索'))), true)

      await showStartCard(env, 'prd_route', { id: 'q_explore' })
      await env.runner.replyToPendingQuestion(replySelections(['prd_route', 'explore', 'r1']))
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('尚未扩展关键词'))), true)

      await showStartCard(env, 'prd_route', { includeChannel: false, id: 'q_email' })
      await env.runner.replyToPendingQuestion(replySelections(['prd_route', 'email']))
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('暂无待起草'))), true)

      const bodies = timelineItems(env.emitted).map((item) => item.body)
      assert.equal(bodies.some((body) => body.includes('暂无原始线索')), true)
      assert.equal(bodies.some((body) => body.includes('尚未扩展关键词')), true)
      assert.equal(bodies.some((body) => body.includes('暂无待起草')), true)
      assert.equal(bodies.some((body) => body.includes('什么是 FOB')), true)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(
        env.creates.some((item) => /score-and-dedupe|discover-leads|draft-outreach-email/.test(item.title ?? '')),
        false,
      )
    } finally {
      env.close()
    }
  })

  it('does not launch from an ordinary question', async () => {
    writeProfile('prd_ready_plain', 'ready')
    const env = harness()
    try {
      await chat(env)
      env.push(
        questionEvent(
          env.chatId,
          [
            {
              header: '范围',
              question: '继续吗',
              custom: false,
              options: [
                { label: '继续', description: '继续聊' },
                { label: '停止', description: '停下' },
              ],
            },
          ],
          'q_plain',
        ),
      )
      assert.equal(
        await waitFor(() => env.emitted.some((event) => event.type === 'awaiting-reply' && event.pending != null)),
        true,
      )
      const reply = await env.runner.replyToPendingQuestion(replySelections(['继续']))
      assert.equal(reply.ok, true)
      await new Promise((resolve) => setTimeout(resolve, 40))
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(timelineItems(env.emitted).some((item) => item.body.startsWith('任务没有启动：')), false)
    } finally {
      env.close()
    }
  })
})

async function waitFor(check: () => boolean | Promise<boolean>): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < 1500) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}
