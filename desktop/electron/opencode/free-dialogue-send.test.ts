import { electronMockReady } from './register-electron-mock.ts'
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentEventPayload, AgentTimelineItem, AgentRunController } from './agent-runner.ts'
import {
  FREE_DIALOGUE_NOT_READY,
  FREE_DIALOGUE_SESSION_TITLE,
  FREE_DIALOGUE_STOPPED,
  FREE_DIALOGUE_TASK_BUSY,
} from './free-dialogue.ts'

const agent = electronMockReady ? await import('./agent-runner.ts') : null
const AgentRunController: typeof import('./agent-runner.ts').AgentRunController | null =
  agent?.AgentRunController ?? null

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

function assistantEvents(sessionId: string, messageId: string, partId: string, text: string): QueueEvent[] {
  return [
    {
      type: 'message.updated',
      properties: {
        sessionID: sessionId,
        info: { id: messageId, role: 'assistant' },
      },
    },
    {
      type: 'message.part.updated',
      properties: {
        sessionID: sessionId,
        part: {
          id: partId,
          messageID: messageId,
          type: 'text',
          text,
        },
      },
    },
  ]
}

function timelineItems(events: AgentEventPayload[]): AgentTimelineItem[] {
  const last = [...events].reverse().find((event) => event.type === 'timeline')
  return last && last.type === 'timeline' ? last.items : []
}

const closers: Array<() => void> = []
after(() => {
  for (const close of closers) close()
})

const describeSend = electronMockReady ? describe : describe.skip

describeSend('sendFreeDialogue', () => {
  it('uses a completed site skill to authorize only matching site edits and ask for a command', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-dialogue-site-'))
    const site = path.join(root, 'website'); fs.mkdirSync(site); fs.mkdirSync(path.join(root, '.ftcs'))
    fs.writeFileSync(path.join(site, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } }))
    fs.writeFileSync(path.join(root, '.ftcs/site.json'), JSON.stringify({ version: 1, projectDir: 'website', buildOutputDir: 'dist' }))
    const previousRoot = process.env.FTCS_WORKSPACE
    process.env.FTCS_WORKSPACE = root
    const stream = createEventStream(), emitted: AgentEventPayload[] = [], replies: Array<{ requestID: string; reply: string }> = []
    let finishWait!: (value: { response: { status: number } }) => void
    const waiting = new Promise<{ response: { status: number } }>(resolve => { finishWait = resolve })
    const client = {
      session: { async create() { return { data: { id: 'ses_site' } } }, async promptAsync() { return {} } },
      event: { async subscribe() { return { stream: stream.stream } } },
      permission: { async reply(call: { requestID: string; reply: string }) { replies.push(call); return { data: true } } },
      v2: { session: { async wait() { return waiting } } },
    }
    const runner = new AgentRunController!(() => client as never)
    const task = runner.sendFreeDialogue('修改网站', event => emitted.push(event))
    const until = async (fn: () => boolean) => { const end = Date.now() + 3000; while (!fn() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10)); assert.ok(fn()) }
    const part = (id: string, tool: string, state: Record<string, unknown>) => ({ type: 'message.part.updated', properties: { sessionID: 'ses_site', part: { id, messageID: 'msg', sessionID: 'ses_site', callID: id, type: 'tool', tool, state } } })
    try {
      await until(() => emitted.some(event => event.type === 'timeline'))
      stream.push(part('skill-1', 'skill', { status: 'completed', input: { name: 'build-website' }, output: 'skill', title: 'skill', metadata: {}, time: { start: 1, end: 2 } }))
      const file = path.join(site, 'page.vue')
      stream.push(part('edit-1', 'write', { status: 'running', input: { filePath: file, content: 'hello' }, time: { start: 3 } }))
      stream.push({ type: 'permission.asked', properties: { id: 'edit-permission', sessionID: 'ses_site', permission: 'edit', patterns: ['website/page.vue'], metadata: { filepath: file }, tool: { messageID: 'msg', callID: 'edit-1' } } })
      await until(() => replies.some(item => item.requestID === 'edit-permission'))
      assert.equal(replies.find(item => item.requestID === 'edit-permission')?.reply, 'once')
      stream.push(part('shell-1', 'bash', { status: 'running', input: { command: 'npm run build', workdir: site }, time: { start: 4 } }))
      stream.push({ type: 'permission.asked', properties: { id: 'shell-permission', sessionID: 'ses_site', permission: 'bash', patterns: ['npm run build'], metadata: { command: 'npm run build' }, tool: { messageID: 'msg', callID: 'shell-1' } } })
      await until(() => emitted.some(event => event.type === 'permission-ask' && event.pending?.command === 'npm run build'))
      assert.equal((await runner.replyToPendingPermission('reject')).ok, true)
      assert.equal(replies.find(item => item.requestID === 'shell-permission')?.reply, 'reject')
    } finally {
      finishWait({ response: { status: 204 } }); await task; runner.disconnect(); stream.close()
      if (previousRoot === undefined) delete process.env.FTCS_WORKSPACE; else process.env.FTCS_WORKSPACE = previousRoot
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
  it('creates a clean session and sends the next message to it', async () => {
    const prompts: Array<{ sessionID: string }> = []
    const emitted: AgentEventPayload[] = []
    let created = 0
    const events = createEventStream()
    closers.push(() => events.close())
    const client = {
      session: {
        async create() { return { data: { id: `ses_${++created}` } } },
        async promptAsync(input: { sessionID: string }) { prompts.push(input); return {} },
      },
      event: { async subscribe() { return { stream: events.stream } } },
      v2: { session: { async wait() { return { response: { status: 204 } } } } },
    }
    const runner = new AgentRunController(() => client as never)
    await runner.sendFreeDialogue('旧会话', event => emitted.push(event))
    const result = await runner.createChatSession(event => emitted.push(event))
    assert.equal(result.ok, true)
    assert.equal(emitted.filter(event => event.type === 'session.created').length, 1)
    await runner.sendFreeDialogue('新会话', event => emitted.push(event))
    assert.deepEqual(prompts.map(prompt => prompt.sessionID), ['ses_1', 'ses_2'])
    assert.equal(created, 2)
    assert.equal(timelineItems(emitted).some(item => item.body.includes('旧会话')), false)
    runner.disconnect()
  })

  it('keeps the current conversation when creation fails or another request is running', async () => {
    let resolveCreate!: (value: { error: { message: string } }) => void
    const client = { session: { create: () => new Promise<{ error: { message: string } }>(resolve => { resolveCreate = resolve }) } }
    const runner = new AgentRunController(() => client as never)
    const events: AgentEventPayload[] = []
    const pending = runner.createChatSession(event => events.push(event))
    assert.equal((await runner.createChatSession(event => events.push(event))).ok, false)
    assert.equal((await runner.sendFreeDialogue('你好', event => events.push(event))).accepted, false)
    resolveCreate({ error: { message: 'unavailable' } })
    assert.equal((await pending).ok, false)
    assert.equal(events.some(event => event.type === 'session.created'), false)
    assert.equal(runner.isRunning(), false)
  })

  it('refuses while a task is running and when the service is down', async () => {
    const prompts: unknown[] = []
    const offline = new AgentRunController(() => null)
    const offlineResult = await offline.sendFreeDialogue('用三句话解释信用证', () => undefined)
    assert.deepEqual(offlineResult, {
      ok: false,
      message: FREE_DIALOGUE_NOT_READY,
      accepted: false,
    })
    assert.equal(offline.isRunning(), false)

    const busy = new AgentRunController(
      () =>
        ({
          session: {
            async promptAsync(input: unknown) {
              prompts.push(input)
              return {}
            },
          },
        }) as never,
    )
    ;(busy as unknown as { running: boolean }).running = true
    const busyResult = await busy.sendFreeDialogue('用三句话解释信用证', () => undefined)
    assert.deepEqual(busyResult, {
      ok: false,
      message: FREE_DIALOGUE_TASK_BUSY,
      accepted: false,
    })
    assert.equal(prompts.length, 0)
    assert.equal(busy.isRunning(), true)
  })

  it('does not send blank text', async () => {
    let creates = 0
    const runner = new AgentRunController(() => {
      creates += 1
      return null
    })
    const result = await runner.sendFreeDialogue('   ', () => undefined)
    assert.deepEqual(result, { ok: true, message: '', accepted: false })
    assert.equal(creates, 0)
  })

  it('creates one 自由对话 session, then reuses it without tools or task state', async () => {
    const sessionId = 'ses_free_1'
    const eventsApi = createEventStream()
    closers.push(() => eventsApi.close())
    const creates: Array<{ title?: string }> = []
    const prompts: Array<Record<string, unknown>> = []
    const emitted: AgentEventPayload[] = []
    let sawIdleWhileNotRunning = false
    let runner: AgentRunController | null = null

    const client = {
      session: {
        async create(input: { title?: string }) {
          creates.push(input)
          return { data: { id: sessionId } }
        },
        async promptAsync(input: Record<string, unknown>) {
          prompts.push(input)
          return {}
        },
        async abort() {
          return {}
        },
        async status() {
          return { data: {} }
        },
      },
      event: {
        async subscribe() {
          return { stream: eventsApi.stream }
        },
      },
      v2: {
        session: {
          async wait() {
            sawIdleWhileNotRunning = runner?.isRunning() === false
            const reply =
              prompts.length === 1
                ? assistantEvents(sessionId, 'msg_1', 'part_1', '信用证是银行作出的付款承诺。')
                : assistantEvents(sessionId, 'msg_2', 'part_2', '上一句还在同一个会话里。')
            for (const event of reply) eventsApi.push(event)
            await new Promise((resolve) => setTimeout(resolve, 30))
            return { response: { status: 204 } }
          },
        },
      },
    }

    runner = new AgentRunController(() => client as never)
    const first = await runner.sendFreeDialogue('用三句话解释信用证', (payload) => {
      emitted.push(payload)
    })
    assert.equal(first.ok, true)
    assert.equal(first.accepted, true)
    assert.equal(sawIdleWhileNotRunning, true)
    assert.equal(runner.isRunning(), false)
    assert.deepEqual(creates, [{ title: FREE_DIALOGUE_SESSION_TITLE }])
    assert.equal(prompts.length, 1)
    assert.deepEqual(Object.keys(prompts[0]!).sort(), ['parts', 'sessionID'])
    assert.equal(prompts[0]!.sessionID, sessionId)
    assert.deepEqual(prompts[0]!.parts, [{ type: 'text', text: '用三句话解释信用证' }])
    assert.equal(emitted.some((event) => event.type === 'done' || event.type === 'state'), false)

    const firstItems = timelineItems(emitted)
    const sessionLine = firstItems.find((item) => item.id === 'sys-session')
    assert.equal(sessionLine?.body, `已创建 OpenCode session\n${sessionId}`)
    const userLine = firstItems.find((item) => item.kind === 'user')
    assert.equal(userLine?.title, '你')
    assert.equal(userLine?.body, '用三句话解释信用证')
    assert.equal(
      firstItems.some((item) => item.kind === 'assistant' && item.body.includes('信用证')),
      true,
    )

    const beforeSecond = emitted.length
    const second = await runner.sendFreeDialogue('还是刚才那个会话吗', (payload) => {
      emitted.push(payload)
    })
    assert.equal(second.ok, true)
    assert.equal(second.accepted, true)
    assert.equal(creates.length, 1)
    assert.equal(prompts.length, 2)
    assert.equal(prompts[1]!.sessionID, sessionId)
    assert.equal(Object.hasOwn(prompts[1]!, 'tools'), false)
    assert.equal(runner.isRunning(), false)
    assert.equal(
      emitted.slice(beforeSecond).some((event) => event.type === 'done' || event.type === 'state'),
      false,
    )

    const items = timelineItems(emitted)
    assert.equal(items.filter((item) => item.id === 'sys-session').length, 1)
    assert.equal(items.find((item) => item.id === 'sys-session')?.body, `已创建 OpenCode session\n${sessionId}`)
    const bodies = items.map((item) => item.body)
    const userAt = bodies.indexOf('用三句话解释信用证')
    const replyAt = bodies.findIndex((body) => body.includes('信用证是银行'))
    const followAt = bodies.indexOf('还是刚才那个会话吗')
    const followReplyAt = bodies.findIndex((body) => body.includes('同一个会话'))
    assert.ok(userAt >= 0 && replyAt > userAt && followAt > replyAt && followReplyAt > followAt)
  })

  it('stops only the current reply and leaves the pipeline idle', async () => {
    const sessionId = 'ses_free_stop'
    const eventsApi = createEventStream()
    closers.push(() => eventsApi.close())
    const emitted: AgentEventPayload[] = []
    let releaseWait: (() => void) | null = null
    const enteredWait = new Promise<void>((resolve) => {
      releaseWait = resolve
    })
    const aborts: string[] = []

    const client = {
      session: {
        async create() {
          return { data: { id: sessionId } }
        },
        async promptAsync() {
          return {}
        },
        async abort(input: { sessionID?: string }) {
          aborts.push(input.sessionID ?? '')
          return {}
        },
      },
      event: {
        async subscribe() {
          return { stream: eventsApi.stream }
        },
      },
      v2: {
        session: {
          async wait(_input: unknown, opts: { signal: AbortSignal }) {
            releaseWait?.()
            await new Promise<void>((resolve) => {
              if (opts.signal.aborted) {
                resolve()
                return
              }
              opts.signal.addEventListener('abort', () => resolve(), { once: true })
            })
            return { response: { status: 204 } }
          },
        },
      },
    }

    const runner = new AgentRunController(() => client as never)
    const pending = runner.sendFreeDialogue('请慢慢讲', (payload) => {
      emitted.push(payload)
    })
    await enteredWait
    assert.equal(runner.isRunning(), false)
    await runner.abortCurrent()
    const result = await pending
    assert.equal(result.ok, true)
    assert.equal(result.accepted, true)
    assert.equal(runner.isRunning(), false)
    assert.deepEqual(aborts, [sessionId])
    assert.equal(emitted.some((event) => event.type === 'done' || event.type === 'state'), false)
    assert.equal(
      timelineItems(emitted).some((item) => item.body === FREE_DIALOGUE_STOPPED),
      true,
    )
  })
})
