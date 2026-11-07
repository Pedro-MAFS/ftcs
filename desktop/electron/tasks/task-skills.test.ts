import '../opencode/register-electron-mock'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import type { OpencodeClient } from '@opencode-ai/sdk/v2'
import type { Begin, TaskRecord, TaskSkill } from './lifecycle'

test('skill preparation and write permissions stay scoped to the product, round and recipient', async (t) => {
  const { AgentRunController } = await import('../opencode/agent-runner')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-task-skills-'))
  const previous = process.env.FTCS_WORKSPACE
  process.env.FTCS_WORKSPACE = root
  t.after(() => {
    if (previous === undefined) delete process.env.FTCS_WORKSPACE
    else process.env.FTCS_WORKSPACE = previous
    fs.rmSync(root, { recursive: true, force: true })
  })
  const write = (file: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), JSON.stringify(data))
  }
  write('data/products/p/profile.json', { id: 'p', status: 'ready', products: [{ name: 'Widget' }] })
  write('data/keywords/p/expansion.json', {
    product_id: 'p',
    search_queries: [
      { round: 'R1', query: 'a' },
      { round: 'R2', site_id: 'linkedin_company', query: 'b' },
      { round: 'R3', query: 'c' },
    ],
  })
  write('data/leads/p/raw/R1.jsonl', { id: 'l', product_id: 'p', company: { name: 'Buyer' } })
  write('data/leads/p/scored.json', {
    leads: [{ id: 'l', product_id: 'p', company: { name: 'Buyer' }, contacts: [] }],
  })
  write('data/emails/l/draft.json', {
    id: 'draft',
    product_id: 'p',
    lead_id: 'l',
    subject: 'Hello',
    body: 'Hello there',
    audience: 'company',
  })
  fs.cpSync(
    fileURLToPath(new URL('../../../workspace/config/', import.meta.url)),
    path.join(root, 'config'),
    { recursive: true },
  )
  fs.writeFileSync(path.join(root, '.env'), 'FTCS_CHANNEL_MODE=custom\nGOOGLE_PLACES_API_KEY=fixture\n')
  let ready!: () => void
  let idle!: () => void
  const submitted = new Promise<void>((resolve) => {
    ready = resolve
  })
  const pending = new Promise<void>((resolve) => {
    idle = resolve
  })
  const client = {
    session: {
      create: async () => ({ data: { id: 's' } }),
      promptAsync: async () => {
        ready()
      },
    },
    event: {
      subscribe: async () => ({
        stream: (async function* () {
          await pending
        })(),
      }),
    },
    v2: {
      session: {
        wait: async () => {
          await pending
          return { response: { status: 204 } }
        },
      },
    },
  } as unknown as OpencodeClient
  const records: TaskRecord[] = []
  const runner = new AgentRunController(() => client, { lifecycle: true })
  const dialogue = runner.sendFreeDialogue('执行', (e) => {
    if (e.type === 'task.changed') records.push(e.task)
  })
  t.after(async () => {
    idle()
    await dialogue
    runner.disconnect()
  })
  await submitted
  const update = await runner.begin('s', {
    protocol_version: 1,
    request_id: randomUUID(),
    task_type: 'extract-product-profile',
    scope: { product_id: 'p' },
    parameters: {},
  })
  assert.equal(update.state, 'running')
  assert.ok('prepared' in update && update.prepared)
  assert.match(String(update.prepared.instructions), /product_get/)
  const updateCall = { sessionID: 's', callID: 'profile-update', tool: 'lead-store_product_save', taskID: update.task_id }
  assert.equal(runner.authorize(updateCall, { product_id: 'p' }), update.task_id)
  assert.throws(() => runner.authorize(updateCall, { product_id: 'other' }))
  runner.recordWrite(updateCall, {})
  const updateDone = await runner.done('s', { task_id: update.task_id, outcome: 'succeeded', message: '已更新' })
  assert.equal(updateDone.state, 'succeeded')
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/products/p/profile.json'), 'utf8')).products[0].name, 'Widget')
  await assert.rejects(runner.begin('s', {
    protocol_version: 1,
    request_id: randomUUID(),
    task_type: 'extract-product-profile',
    scope: { product_id: 'missing' },
    parameters: {},
  }), /未找到所选产品/)
  const run = async (
    skill: TaskSkill,
    tool: string,
    scope: Begin['scope'],
    parameters: Begin['parameters'],
    args: Record<string, unknown>,
  ) => {
    const started = await runner.begin('s', {
      protocol_version: 1,
      request_id: randomUUID(),
      task_type: skill,
      scope,
      parameters,
    })
    const context = { sessionID: 's', callID: 'call', tool: 'lead-store_' + tool }
    assert.equal(started.state, 'running', skill)
    assert.equal(runner.authorize(context, args), started.task_id, skill)
    assert.throws(() => runner.authorize({ ...context, sessionID: 'child' }, args))
    assert.throws(() => runner.authorize(context, { ...args, product_id: 'other' }))
    const done = await runner.done('s', { task_id: started.task_id, outcome: 'succeeded', message: '完成' })
    assert.equal(done.state, 'failed', '历史产物不能证明本次保存成功')
  }
  await run('expand-keywords', 'keywords_save', { product_id: 'p' }, {}, { product_id: 'p' })
  for (const [round, skill] of [
    ['R1', 'discover-leads'],
    ['R2', 'discover-leads-r2'],
    ['R3', 'discover-leads-r3'],
  ] as const) {
    await run(skill, 'exploration_start', { product_id: 'p' }, {}, { product_id: 'p', rounds: [round] })
  }
  await run('score-and-dedupe', 'leads_score_and_dedupe', { product_id: 'p' }, {}, { product_id: 'p' })
  await run(
    'enrich-lead-contacts',
    'leads_patch_scored',
    { product_id: 'p' },
    { lead_ids: ['l'], verify_emails: false },
    { product_id: 'p', lead_id: 'l' },
  )
  await run(
    'draft-outreach-email',
    'email_draft_plan',
    { product_id: 'p' },
    { mode: 'batch', lead_ids: ['l'] },
    { product_id: 'p' },
  )
  const slot = { product_id: 'p', lead_id: 'l', recipient_key: 'company' }
  await run('draft-outreach-email', 'email_draft_plan_slot', slot, { mode: 'slot' }, slot)
  await run('translate-outreach-email', 'email_draft_save_zh', slot, {}, slot)
  assert.equal(records.filter((r) => r.finished_at).length, 11)
})
