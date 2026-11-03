import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  PERMISSION_HARD_BOUNDARY_REJECT_MESSAGE,
  PERMISSION_INVALID_CHOICE_MESSAGE,
  PERMISSION_NONE_PENDING_MESSAGE,
  PERMISSION_REPLY_FAILED_MESSAGE,
  PERMISSION_TASK_REJECT_MESSAGE,
  PERMISSION_USER_REJECT_MESSAGE,
  PermissionCoordinator,
  type PermissionCardView,
  type PermissionReplyCall,
  type PermissionReplyOutcome,
  buildPermissionReply,
  classifyPermissionHttpResult,
  isHardBoundaryPermission,
  normalizePermissionChoice,
  readPermissionAsk,
} from './permission-gate.ts'

const desktopRoot = fileURLToPath(new URL('../..', import.meta.url))

function collectSources(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist' || entry.name === 'release') {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectSources(full, out)
    else if (/\.(ts|vue|mjs|js)$/.test(entry.name)) out.push(full)
  }
}

function harness(options?: { running?: boolean }) {
  let running = options?.running ?? false
  let failed = false
  const calls: PermissionReplyCall[] = []
  const cards: Array<PermissionCardView | null> = []
  let failures = 0
  const script: PermissionReplyOutcome[] = []

  const gate = new PermissionCoordinator({
    isRunning: () => running,
    hasFailed: () => failed,
    reply: async (call) => {
      calls.push(call)
      const next = script.shift()
      return next ?? 'ok'
    },
    emit: (pending) => {
      cards.push(pending)
    },
    onReplyFailed: () => {
      failures += 1
      failed = true
      gate.clear()
    },
  })

  return {
    gate,
    calls,
    cards,
    failures: () => failures,
    setRunning(value: boolean) {
      running = value
    },
    failNext(...outcomes: PermissionReplyOutcome[]) {
      script.push(...outcomes)
    },
    markFailed() {
      failed = true
    },
  }
}

describe('normalizePermissionChoice', () => {
  it('只接受 once，并把 always 当成 reject', () => {
    assert.equal(normalizePermissionChoice('once'), 'once')
    assert.equal(normalizePermissionChoice('reject'), 'reject')
    assert.equal(normalizePermissionChoice('always'), 'reject')
    assert.equal(normalizePermissionChoice('ALWAYS'), null)
    assert.equal(normalizePermissionChoice({ reply: 'once' }), null)
    assert.equal(normalizePermissionChoice(''), null)
    assert.equal(normalizePermissionChoice(null), null)
  })
})

describe('buildPermissionReply', () => {
  it('once 不带 message，reject 才附短句', () => {
    assert.deepEqual(buildPermissionReply({ requestID: 'req-1', reply: 'once', message: '不要' }), {
      requestID: 'req-1',
      reply: 'once',
    })
    assert.deepEqual(
      buildPermissionReply({ requestID: 'req-1', reply: 'reject', message: PERMISSION_USER_REJECT_MESSAGE }),
      { requestID: 'req-1', reply: 'reject', message: PERMISSION_USER_REJECT_MESSAGE },
    )
  })
})

describe('readPermissionAsk', () => {
  it('读取 permission 与字符串工具键，忽略调用 id', () => {
    assert.deepEqual(
      readPermissionAsk({
        type: 'permission.asked',
        properties: {
          id: 'req-1',
          sessionID: 'ses',
          permission: 'webfetch',
          tool: { messageID: 'msg', callID: 'call' },
        },
      }),
      { id: 'req-1', permission: 'webfetch' },
    )
    assert.deepEqual(
      readPermissionAsk({
        type: 'permission.v2.asked',
        properties: { id: 'req-2', action: 'task', metadata: { tool: 'lead-store_product_list' } },
      }),
      { id: 'req-2', permission: 'task', tool: 'lead-store_product_list' },
    )
    assert.equal(readPermissionAsk({ type: 'question.asked', properties: { id: 'q' } }), null)
  })
})

describe('isHardBoundaryPermission', () => {
  it('edit、bash、shell、external_directory 大小写都不进授权卡', () => {
    for (const name of ['edit', 'bash', 'shell', 'external_directory', 'Bash', 'SHELL']) {
      assert.equal(isHardBoundaryPermission(name), true, name)
    }
    assert.equal(isHardBoundaryPermission('webfetch'), false)
    assert.equal(isHardBoundaryPermission('websearch'), false)
  })
})

describe('PermissionCoordinator', () => {
  it('任务中立即 reject，不画卡，也不写已自动拒绝', async () => {
    const env = harness({ running: true })
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    assert.deepEqual(env.calls, [
      {
        requestID: 'req-1',
        reply: 'reject',
        message: PERMISSION_TASK_REJECT_MESSAGE,
      },
    ])
    assert.deepEqual(env.cards, [])
    assert.equal(env.failures(), 0)
    assert.equal(JSON.stringify(env.calls).includes('已自动拒绝'), false)
  })

  it('续聊画出授权卡，同意只回复 once', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch', tool: 'webfetch' })
    assert.deepEqual(env.cards, [{ permission: 'webfetch', tool: 'webfetch' }])
    assert.equal(JSON.stringify(env.cards).includes('req-1'), false)
    const result = await env.gate.replyFromUser('once')
    assert.deepEqual(result, { ok: true, message: '' })
    assert.deepEqual(env.calls, [{ requestID: 'req-1', reply: 'once' }])
    assert.deepEqual(env.cards.at(-1), null)
  })

  it('用户拒绝带短句，并清掉同一会话里其它等待', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    await env.gate.onAsked({ id: 'req-2', permission: 'websearch' })
    assert.deepEqual(env.cards.at(-1), { permission: 'webfetch' })
    const result = await env.gate.replyFromUser('reject')
    assert.deepEqual(result, { ok: true, message: '' })
    assert.deepEqual(env.calls, [
      {
        requestID: 'req-1',
        reply: 'reject',
        message: PERMISSION_USER_REJECT_MESSAGE,
      },
    ])
    assert.deepEqual(env.cards.at(-1), null)
    const again = await env.gate.replyFromUser('once')
    assert.deepEqual(again, { ok: false, message: PERMISSION_NONE_PENDING_MESSAGE })
  })

  it('渲染进程传来的 always 按拒绝处理', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'task' })
    const result = await env.gate.replyFromUser('always')
    assert.equal(result.ok, true)
    assert.equal(env.calls[0]?.reply, 'reject')
    assert.equal(env.calls[0]?.message, PERMISSION_USER_REJECT_MESSAGE)
    assert.equal(JSON.stringify(env.calls).includes('"reply":"always"'), false)
  })

  it('硬边界拒绝会清掉已经摆出来的授权', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    await env.gate.onAsked({ id: 'req-2', permission: 'shell' })
    assert.deepEqual(env.cards.at(-1), null)
    const result = await env.gate.replyFromUser('once')
    assert.deepEqual(result, { ok: false, message: PERMISSION_NONE_PENDING_MESSAGE })
  })

  it('硬边界在续聊也直接拒绝，不画卡', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'external_directory' })
    await env.gate.onAsked({ id: 'req-2', permission: 'Bash' })
    assert.deepEqual(env.cards, [])
    assert.deepEqual(
      env.calls.map((call) => call.message),
      [PERMISSION_HARD_BOUNDARY_REJECT_MESSAGE, PERMISSION_HARD_BOUNDARY_REJECT_MESSAGE],
    )
    assert.deepEqual(
      env.calls.map((call) => call.reply),
      ['reject', 'reject'],
    )
  })

  it('同意当前项后才展示下一项', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    await env.gate.onAsked({ id: 'req-2', permission: 'websearch' })
    await env.gate.replyFromUser('once')
    assert.deepEqual(env.cards.at(-1), { permission: 'websearch' })
    assert.deepEqual(env.calls.map((call) => call.requestID), ['req-1'])
  })

  it('回复失败重试一次，仍失败就通知停止', async () => {
    const env = harness({ running: true })
    env.failNext('failed', 'failed')
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    assert.equal(env.calls.length, 2)
    assert.equal(env.failures(), 1)
    assert.deepEqual(env.cards.at(-1), null)
  })

  it('第一次失败、第二次成功则不停止', async () => {
    const env = harness()
    env.failNext('failed', 'ok')
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    const result = await env.gate.replyFromUser('once')
    assert.equal(result.ok, true)
    assert.equal(env.calls.length, 2)
    assert.equal(env.failures(), 0)
  })

  it('请求已经不在时不把 404 当成回复失败', async () => {
    const env = harness({ running: true })
    env.failNext('gone')
    await env.gate.onAsked({ id: 'req-1', permission: 'edit' })
    assert.equal(env.calls.length, 1)
    assert.equal(env.failures(), 0)
  })

  it('无效选择不调用回复', async () => {
    const env = harness()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    const result = await env.gate.replyFromUser({ reply: 'once' })
    assert.deepEqual(result, { ok: false, message: PERMISSION_INVALID_CHOICE_MESSAGE })
    assert.equal(env.calls.length, 0)
    assert.deepEqual(env.cards.at(-1), { permission: 'webfetch' })
  })

  it('停止后不再接收新的授权询问', async () => {
    const env = harness()
    env.markFailed()
    await env.gate.onAsked({ id: 'req-1', permission: 'webfetch' })
    assert.equal(env.calls.length, 0)
    assert.deepEqual(env.cards, [])
  })
})

describe('classifyPermissionHttpResult', () => {
  it('404 与 PermissionNotFound 视为已结束', () => {
    assert.equal(classifyPermissionHttpResult({ error: { _tag: 'PermissionNotFoundError' }, data: undefined, status: 404 }), 'gone')
    assert.equal(classifyPermissionHttpResult({ error: new Error('network'), data: undefined }), 'failed')
    assert.equal(classifyPermissionHttpResult({ error: undefined, data: true, status: 200 }), 'ok')
    assert.equal(classifyPermissionHttpResult({ error: undefined, data: false, status: 200 }), 'failed')
  })
})

describe('US-FD-02 代码路径', () => {
  it('桌面源码不再回复 always', () => {
    const files: string[] = []
    collectSources(path.join(desktopRoot, 'electron'), files)
    collectSources(path.join(desktopRoot, 'src'), files)
    const pattern = /reply:\s*['"]always['"]/
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      assert.equal(pattern.test(text), false, file)
    }
  })

  it('授权卡文案与独立 IPC，不复用提问卡', () => {
    const card = readFileSync(
      path.join(desktopRoot, 'src/components/layout/AgentPermissionCard.vue'),
      'utf8',
    )
    const panel = readFileSync(path.join(desktopRoot, 'src/components/layout/AgentPanel.vue'), 'utf8')
    const types = readFileSync(path.join(desktopRoot, 'electron/ipc/types.ts'), 'utf8')
    const preload = readFileSync(path.join(desktopRoot, 'electron/preload.ts'), 'utf8')
    const main = readFileSync(path.join(desktopRoot, 'electron/main.ts'), 'utf8')
    const runner = readFileSync(path.join(desktopRoot, 'electron/opencode/agent-runner.ts'), 'utf8')
    assert.equal(card.includes('需要你的授权'), true)
    assert.equal(card.includes('同意这一次'), true)
    assert.equal(card.includes('拒绝'), true)
    assert.equal(card.includes('同一会话里其它还在等的授权会一起取消。'), true)
    assert.equal(card.includes('始终允许'), false)
    assert.equal(card.includes('replyQuestion'), false)
    assert.equal(card.includes('replyPermission'), true)
    assert.equal(panel.includes('AgentPermissionCard'), true)
    assert.equal(types.includes("AGENT_REPLY_PERMISSION: 'agent:reply-permission'"), true)
    assert.equal(preload.includes('replyPermission'), true)
    assert.equal(main.includes('AGENT_REPLY_PERMISSION'), true)
    assert.equal(runner.includes('permissionGate.onAsked'), true)
    assert.equal(runner.includes('已自动拒绝'), false)
    assert.equal(runner.includes('question.asked'), true)
  })
})
