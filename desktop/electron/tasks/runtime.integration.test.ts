import '../opencode/register-electron-mock'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { createOpencode } from '@opencode-ai/sdk/v2'
import { openTaskBridge } from './bridge'
import type { TaskRecord } from './lifecycle'

// Set FTCS_TEST_OPENCODE to the pinned binary. The local provider scripts tool
// calls while the actual OpenCode server, plugin, stdio MCP and runner execute.
test(
  'OpenCode binds begin, a real profile save and done to the original chat',
  {
    skip: !process.env.FTCS_TEST_OPENCODE,
    timeout: 110_000,
  },
  async (t) => {
    const workspace = fileURLToPath(new URL('../../../workspace/', import.meta.url))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-task-e2e-'))
    const previous = process.cwd()
    const { AgentRunController } = await import('../opencode/agent-runner')
    const states: TaskRecord[] = []
    const inputs = path.join(dir, 'data/library/files')
    fs.mkdirSync(inputs, { recursive: true })
    fs.writeFileSync(path.join(inputs, 'catalog.txt'), '测试公司产品资料')
    fs.cpSync(path.join(workspace, 'config'), path.join(dir, 'config'), { recursive: true })
    process.chdir(dir)
    t.after(() => {
      process.chdir(previous)
      fs.rmSync(dir, { recursive: true, force: true })
    })
    const model = http.createServer(async (req, res) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const turn = body.messages.slice(
        body.messages.findLastIndex((m: { role: string }) => m.role === 'user'),
      )
      const replies = turn.filter((m: { role: string }) => m.role === 'tool')
      const current = states.at(-1)
      const content = turn[0]?.content
      const text = typeof content === 'string' ? content : content?.map((part: {text?: string}) => part.text ?? '').join('') ?? ''
      const button = text.match(/lead-store\.task_begin：(.+?)。使用返回的 prepared/)
      const script = button
        ? [
            [
              'task_begin',
              JSON.parse(button[1]),
            ],
            [
              'task_done',
              {
                request_id: randomUUID(),
                protocol_version: 1,
                task_id: current?.task_id,
                outcome: 'succeeded',
                message: '无需起草',
              },
            ],
          ]
        : [
            [
              'question',
              {
                questions: [
                  {
                    header: '选择原始文件',
                    question: '使用哪些资料？',
                    multiple: true,
                    options: [{ label: 'catalog.txt', description: '产品资料' }],
                  },
                ],
              },
            ],
            [
              'task_begin',
              {
                request_id: randomUUID(),
                protocol_version: 1,
                task_type: 'extract-product-profile',
                scope: {},
                parameters: { library_sources: ['catalog.txt'] },
              },
            ],
            [
              'product_save',
              {
                product_id: current?.scope.product_id,
                profile: { company: { name: '测试公司' }, products: [{ name: '测试产品' }] },
              },
            ],
            [
              'task_done',
              {
                request_id: randomUUID(),
                protocol_version: 1,
                task_id: current?.task_id,
                outcome: 'succeeded',
                message: '已保存画像',
              },
            ],
          ]
      const call = body.tools?.length && script[replies.length]
      const delta = call
        ? {
            tool_calls: [
              {
                index: 0,
                id: 'call_' + randomUUID(),
                type: 'function',
                function: {
                  name: call[0] === 'question' ? 'question' : 'lead-store_' + call[0],
                  arguments: JSON.stringify(call[1]),
                },
              },
            ],
          }
        : { content: '完成' }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const [d, reason] of [
        [delta, null],
        [{}, call ? 'tool_calls' : 'stop'],
      ]) {
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'chatcmpl-test',
              object: 'chat.completion.chunk',
              model: 'local',
              created: 1,
              choices: [{ index: 0, delta: d, finish_reason: reason }],
            }) +
            '\n\n',
        )
      }
      res.end('data: [DONE]\n\n')
    })
    model.listen(0, '127.0.0.1')
    await once(model, 'listening')
    t.after(() => {
      model.closeAllConnections()
      model.close()
    })
    const port = (model.address() as { port: number }).port
    let client: Awaited<ReturnType<typeof createOpencode>>['client'] | null = null
    const runner = new AgentRunController(() => client, { lifecycle: true })
    const bridge = await openTaskBridge(() => runner)
    t.after(() => bridge.close())
    const env = {
      PATH: path.dirname(process.env.FTCS_TEST_OPENCODE!) + path.delimiter + process.env.PATH,
      FTCS_WORKSPACE: dir,
      FTCS_TASK_URL: bridge.url,
      FTCS_TASK_PLUGIN_KEY: bridge.pluginKey,
      XDG_DATA_HOME: path.join(dir, 'xdg-data'),
      XDG_CONFIG_HOME: path.join(dir, 'xdg-config'),
      XDG_STATE_HOME: path.join(dir, 'xdg-state'),
      OPENCODE_DISABLE_MODELS_FETCH: '1',
      OPENCODE_CONFIG: path.join(dir, 'opencode.json'),
    }
    const oldEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]))
    Object.assign(process.env, env)
    t.after(() => {
      for (const [key, value] of oldEnv) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })
    fs.writeFileSync(env.OPENCODE_CONFIG, '{}')
    const runtime = await createOpencode({
      port: 0,
      timeout: 50_000,
      config: {
        plugin: [pathToFileURL(path.join(workspace, 'config/opencode/task-context.mjs')).href],
        model: 'fixture/local',
        small_model: 'fixture/local',
        permission: { '*': 'allow' },
        provider: {
          fixture: {
            npm: '@ai-sdk/openai-compatible',
            name: 'fixture',
            options: { baseURL: 'http://127.0.0.1:' + port + '/v1', apiKey: 'fixture' },
            models: { local: { name: 'local' } },
          },
        },
        mcp: {
          'lead-store': {
            type: 'local',
            command: [process.execPath, path.join(workspace, 'mcp-servers/lead-store/dist/mcp.js')],
            environment: { FTCS_TASK_URL: bridge.url, FTCS_TASK_MCP_KEY: bridge.mcpKey, FTCS_WORKSPACE: dir },
          },
        },
      },
    })
    client = runtime.client
    t.after(() => {
      runner.disconnect()
      runtime.server.close()
    })
    let questions = 0
    const reply = await runner.sendFreeDialogue('生成产品画像', (event) => {
      if (event.type === 'task.changed') states.push(event.task)
      if (event.type === 'awaiting-reply' && event.pending) {
        questions++
        void runner.replyToPendingQuestion({
          selections: [{ optionLabels: ['catalog.txt'], customText: '' }],
        })
      }
    })
    assert.equal(reply.ok, true, reply.message)
    assert.equal(questions, 1, JSON.stringify({ reply, states }))
    assert.deepEqual(
      states.map((state) => state.state),
      ['preparing', 'preparing', 'running', 'succeeded'],
      JSON.stringify(states),
    )
    assert.equal(new Set(states.map((s) => s.session_id)).size, 1)
    assert.ok(fs.existsSync(path.join(dir, 'data/products', states[3].scope.product_id!, 'profile.json')))
    const profile = states[3]
    let resolveFinished!: (record: TaskRecord) => void
    const finished = new Promise<TaskRecord>((resolve) => {
      resolveFinished = resolve
    })
    const nextId = runner.launchButton(
      'draft-outreach-email',
      { product_id: profile.scope.product_id },
      { mode: 'batch' },
      (event) => {
        if (event.type === 'task.changed') {
          states.push(event.task)
          if (event.task.finished_at) resolveFinished(event.task)
        }
      },
      'workflow',
    )
    const next = await finished
    assert.equal(next.task_id, nextId)
    assert.equal(next.origin, 'workflow')
    assert.notEqual(next.session_id, profile.session_id)
    assert.equal(next.state, 'succeeded', next.message)
    await runner.waitForFinishedButton()
  },
)
