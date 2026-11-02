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
  CHAT_START_NO_PRODUCT,
  CHAT_START_UNAUTHORIZED,
} from './chat-start-task.ts'

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
  function harness(options?: { failCreate?: boolean }) {
    const chatId = 'ses_chat'
    const taskId = 'ses_task'
    const streams: Array<ReturnType<typeof createEventStream>> = []
    const creates: Array<{ title?: string }> = []
    const aborts: string[] = []
    const replies: unknown[] = []
    const order: string[] = []
    let releaseCreate: (() => void) | null = null
    let enteredCreate: (() => void) | null = null
    const createEntered = new Promise<void>((resolve) => {
      enteredCreate = resolve
    })
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
              await new Promise((resolve) => setTimeout(resolve, 20))
            }
            return { response: { status: 204 } }
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
      order,
      push,
      createEntered,
      releaseCreate: () => releaseCreate?.(),
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

  it('keeps the chat when the stage cannot be started', async () => {
    const env = harness()
    try {
      await chat(env)
      env.runner.noteActiveProduct('prd_missing')
      env.push(toolEvent(env.chatId, 'tool_bad', { ok: false, code: 'bad_stage', stage: 'profile' }))
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

  it('keeps the chat when there is no current product', async () => {
    const env = harness()
    try {
      await chat(env)
      env.push(toolEvent(env.chatId, 'tool_none', { ok: true, stage: 'keywords', product_id: null }))
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body === CHAT_START_NO_PRODUCT)), true)
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(items.some((item) => item.body === CHAT_START_NO_PRODUCT), true)
      assert.equal(env.runner.isRunning(), false)
    } finally {
      env.close()
    }
  })

  it('appends the existing readiness reason and does not start', async () => {
    writeProfile('prd_draft', 'draft')
    const env = harness()
    try {
      await chat(env)
      env.push(toolEvent(env.chatId, 'tool_draft', { ok: true, stage: 'keywords', product_id: 'prd_draft' }))
      assert.equal(
        await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('画像未就绪'))),
        true,
      )
      const items = timelineItems(env.emitted)
      const notice = items.find((item) => item.body.startsWith('任务没有启动：'))
      assert.equal(notice?.body.includes('画像未就绪'), true)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.creates.some((item) => item.title?.startsWith('expand-keywords')), false)
      assert.equal(env.aborts.includes(env.chatId), false)
    } finally {
      env.close()
    }
  })

  it('appends 未授权 when the start permission is rejected and does not run the tool', async () => {
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
      assert.equal(
        await waitFor(() => env.emitted.some((event) => event.type === 'permission-ask' && event.pending != null)),
        true,
      )
      assert.equal(
        env.emitted.some((event) => event.type === 'permission-ask' && event.pending != null),
        true,
      )
      assert.equal(env.runner.isRunning(), false)
      const reply = await env.runner.replyToPendingPermission('reject')
      assert.equal(reply.ok, true)
      const items = timelineItems(env.emitted)
      assert.equal(items.some((item) => item.body === CHAT_START_UNAUTHORIZED), true)
      assert.equal(items.some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(env.creates.length, 1)
      assert.equal(env.runner.isRunning(), false)
    } finally {
      env.close()
    }
  })

  it('does not clear the chat when session.create fails', async () => {
    writeProfile('prd_ready_fail', 'ready')
    const env = harness({ failCreate: true })
    try {
      await chat(env)
      env.push(toolEvent(env.chatId, 'tool_fail', { ok: true, stage: 'keywords', product_id: 'prd_ready_fail' }))
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
      assert.equal(items.some((item) => item.body.includes('任务没有启动：') && item.body.includes('创建 OpenCode 会话失败')), true)
      assert.equal(env.runner.isRunning(), false)
      assert.equal(env.aborts.includes(env.chatId), false)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), false)
    } finally {
      env.close()
    }
  })

  it('replaces the timeline only after create, then follows the new session', async () => {
    writeProfile('prd_ready', 'ready')
    const env = harness()
    try {
      await chat(env)
      env.push(toolEvent(env.chatId, 'tool_ok', { ok: true, stage: 'keywords', product_id: 'prd_ready' }))
      await env.createEntered
      assert.equal(env.runner.isRunning(), false)
      assert.equal(timelineItems(env.emitted).some((item) => item.body.includes('什么是 FOB')), true)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), false)
      assert.equal(env.aborts.includes(env.chatId), false)
      env.releaseCreate()
      const replaced = await waitFor(async () => {
        const items = timelineItems(env.emitted)
        return items.some((item) => item.id === 'sys-session' && item.body.includes(env.taskId))
      })
      assert.equal(replaced, true)
      const taskItems = timelineItems(env.emitted)
      assert.equal(taskItems.some((item) => item.body.includes('什么是 FOB')), false)
      assert.equal(taskItems.some((item) => item.id === 'sys-session' && item.body.includes('已创建 OpenCode session')), true)
      assert.equal(env.runner.isRunning(), true)
      assert.equal(env.emitted.some((event) => event.type === 'state' && event.status === 'running'), true)
      assert.ok(env.order.indexOf('create-end') >= 0)
      assert.ok(env.order.indexOf('create-end') < env.order.indexOf(`abort:${env.chatId}`))

      env.push({
        type: 'permission.asked',
        properties: {
          id: 'req_second',
          sessionID: env.taskId,
          permission: 'ftcs-task_start_task',
        },
      })
      env.push(toolEvent(env.taskId, 'tool_again', { ok: true, stage: 'keywords', product_id: 'prd_ready' }))
      await new Promise((resolve) => setTimeout(resolve, 40))
      assert.equal(env.replies.length, 1)
      assert.equal(env.creates.filter((item) => item.title?.startsWith('expand-keywords')).length, 1)
      assert.equal(
        env.emitted.some(
          (event) => event.type === 'permission-ask' && event.pending?.permission === 'ftcs-task_start_task',
        ),
        false,
      )
      assert.equal(timelineItems(env.emitted).some((item) => item.body === CHAT_START_ALREADY_RUNNING), false)
    } finally {
      await env.runner.abortCurrent()
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
      env.push(toolEvent(env.chatId, 'tool_score', { ok: true, stage: 'score', product_id: 'prd_route' }))
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('暂无原始线索'))), true)
      env.push(
        toolEvent(env.chatId, 'tool_explore', {
          ok: true,
          stage: 'explore',
          explore_channel: 'r1',
          product_id: 'prd_route',
        }),
      )
      assert.equal(await waitFor(() => timelineItems(env.emitted).some((item) => item.body.includes('尚未扩展关键词'))), true)
      env.push(toolEvent(env.chatId, 'tool_email', { ok: true, stage: 'email', product_id: 'prd_route' }))
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
})

async function waitFor(check: () => boolean | Promise<boolean>): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < 1500) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}
