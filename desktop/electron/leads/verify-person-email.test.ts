import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'

const here = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(here, 'electron-test-hook.mjs')).href)

const { verifyPersonEmail } = await import('./verify-person-email.ts')
const { OFFICIAL_DRAWER_BLOCKED } = await import('../../src/domain/drawer-verify-gate.ts')
const {
  OFFICIAL_DRAWER_VERIFY_FAILED,
  OFFICIAL_DRAWER_VERIFY_PENDING,
  OFFICIAL_DRAWER_VERIFIER_TIMEOUT_MS,
} = await import('./official-person-verifier.ts')

function writeLead(root: string): void {
  const dir = path.join(root, 'data', 'leads', 'prod')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(root, '.env'),
    'HUNTER_API_KEYS=hunter-secret-key\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, 'scored.json'),
    `${JSON.stringify({
      leads: [
        {
          id: 'lead1',
          people: [{ id: 'person1', email: 'a@example.com', confidence: 80 }],
        },
      ],
    })}\n`,
    'utf8',
  )
}

function scoredText(root: string): string {
  return fs.readFileSync(path.join(root, 'data', 'leads', 'prod', 'scored.json'), 'utf8')
}

function withOfficialEnv(run: () => Promise<void>): Promise<void> {
  const previous = {
    mode: process.env.FTCS_CHANNEL_MODE,
    key: process.env.FTCS_GATEWAY_API_KEY,
    base: process.env.FTCS_TOKEN_GATEWAY_BASE_URL,
    verify: process.env.HUNTER_VERIFY_EMAILS,
  }
  process.env.FTCS_CHANNEL_MODE = 'official'
  process.env.FTCS_GATEWAY_API_KEY = 'sk-official'
  process.env.FTCS_TOKEN_GATEWAY_BASE_URL = 'https://gw.example/v1/'
  process.env.HUNTER_VERIFY_EMAILS = 'false'
  return run().finally(() => {
    for (const [name, value] of Object.entries({
      FTCS_CHANNEL_MODE: previous.mode,
      FTCS_GATEWAY_API_KEY: previous.key,
      FTCS_TOKEN_GATEWAY_BASE_URL: previous.base,
      HUNTER_VERIFY_EMAILS: previous.verify,
    })) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

describe('drawer verify person', { concurrency: 1 }, () => {
test('官方未开通时抽屉验邮不发 HTTP', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-verify-official-closed-'))
  writeLead(root)
  const before = scoredText(root)
  const previous = process.env.FTCS_CHANNEL_MODE
  const previousKey = process.env.FTCS_GATEWAY_API_KEY
  process.env.FTCS_CHANNEL_MODE = 'official'
  delete process.env.FTCS_GATEWAY_API_KEY
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('should not fetch')
  }) as typeof fetch
  try {
    const result = await verifyPersonEmail(
      { productId: 'prod', leadId: 'lead1', personId: 'person1' },
      root,
    )
    assert.equal(result.ok, false)
    assert.equal(result.message, OFFICIAL_DRAWER_BLOCKED)
    assert.equal(result.message.includes('Hunter'), false)
    assert.equal(calls, 0)
    assert.equal(scoredText(root), before)
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.FTCS_CHANNEL_MODE
    else process.env.FTCS_CHANNEL_MODE = previous
    if (previousKey === undefined) delete process.env.FTCS_GATEWAY_API_KEY
    else process.env.FTCS_GATEWAY_API_KEY = previousKey
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('官方已开通且无可用条件依赖用户 Key：一次网关 POST，unknown 写成 hunter_unknown', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-verify-official-open-'))
  writeLead(root)
  const original = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(
      JSON.stringify({ data: { status: 'unknown', score: 12, email: 'a@example.com' } }),
      { status: 200 },
    )
  }) as typeof fetch
  try {
    await withOfficialEnv(async () => {
      assert.equal(OFFICIAL_DRAWER_VERIFIER_TIMEOUT_MS, 90_000)
      const result = await verifyPersonEmail(
        { productId: 'prod', leadId: 'lead1', personId: 'person1' },
        root,
      )
      assert.equal(result.ok, true)
      assert.match(result.message, /hunter_unknown/)
      assert.equal(calls.length, 1)
      const url = calls[0]!.url
      assert.equal(url, 'https://gw.example/v1/hunter/email-verifier')
      assert.equal(url.includes('/v1/v1/'), false)
      assert.equal(url.includes('api.hunter.io'), false)
      const headers = calls[0]!.init?.headers as Record<string, string>
      assert.equal(headers.Authorization, 'Bearer sk-official')
      assert.equal(headers['X-API-Key'], undefined)
      assert.equal(JSON.stringify(calls[0]!.init).includes('hunter-secret-key'), false)
      assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), { email: 'a@example.com' })
      assert.equal(calls[0]!.init?.method, 'POST')
      assert.ok(calls[0]!.init?.signal)
      const stored = JSON.parse(scoredText(root)) as {
        leads: Array<{ people: Array<{ email_status?: string }> }>
      }
      assert.equal(stored.leads[0]?.people[0]?.email_status, 'hunter_unknown')
    })
  } finally {
    globalThis.fetch = original
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('官方抽屉 504 不写文件，502 文案不同', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-verify-official-errors-'))
  writeLead(root)
  const before = scoredText(root)
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async (_url, init) => {
    calls += 1
    const email = JSON.parse(String(init?.body)).email as string
    if (email === 'a@example.com') {
      return new Response(
        JSON.stringify({
          error: { code: 'hunter_verification_pending', message: 'hunter_verification_pending' },
        }),
        { status: 504 },
      )
    }
    return new Response(
      JSON.stringify({ error: { code: 'hunter_upstream_error', message: 'hunter_upstream_error' } }),
      { status: 502 },
    )
  }) as typeof fetch
  try {
    await withOfficialEnv(async () => {
      const pending = await verifyPersonEmail(
        { productId: 'prod', leadId: 'lead1', personId: 'person1' },
        root,
      )
      assert.equal(pending.ok, false)
      assert.equal(pending.message, OFFICIAL_DRAWER_VERIFY_PENDING)
      assert.equal(scoredText(root), before)
      assert.equal(calls, 1)

      const stored = JSON.parse(before) as { leads: Array<{ people: Array<Record<string, unknown>> }> }
      stored.leads[0]!.people[0]!.email = 'b@example.com'
      fs.writeFileSync(path.join(root, 'data', 'leads', 'prod', 'scored.json'), `${JSON.stringify(stored)}\n`)
      const failed = await verifyPersonEmail(
        { productId: 'prod', leadId: 'lead1', personId: 'person1' },
        root,
      )
      assert.equal(failed.ok, false)
      assert.equal(failed.message, OFFICIAL_DRAWER_VERIFY_FAILED)
      assert.notEqual(failed.message, OFFICIAL_DRAWER_VERIFY_PENDING)
      assert.equal(calls, 2)
    })
  } finally {
    globalThis.fetch = original
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('自定义抽屉验邮仍直连 api.hunter.io', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-verify-custom-'))
  writeLead(root)
  const previous = process.env.FTCS_CHANNEL_MODE
  delete process.env.FTCS_CHANNEL_MODE
  const original = globalThis.fetch
  const calls: Array<{ url: string; key?: string }> = []
  globalThis.fetch = (async (url, init) => {
    const headers = init?.headers as Record<string, string> | undefined
    calls.push({ url: String(url), key: headers?.['X-API-Key'] })
    return new Response(JSON.stringify({ errors: [] }), { status: 401 })
  }) as typeof fetch
  try {
    const result = await verifyPersonEmail(
      { productId: 'prod', leadId: 'lead1', personId: 'person1' },
      root,
    )
    assert.equal(result.ok, false)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url.includes('https://api.hunter.io/v2/email-verifier'), true)
    assert.equal(calls[0]?.key, 'hunter-secret-key')
    assert.equal(calls[0]?.url.includes('/hunter/email-verifier'), false)
    assert.equal(calls[0]?.url.includes('gw.example'), false)
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.FTCS_CHANNEL_MODE
    else process.env.FTCS_CHANNEL_MODE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('官方 451 在一次点击里只请求一次', async () => {
  const { verifyEmailViaOfficialGateway, OFFICIAL_DRAWER_CLAIMED } = await import(
    './official-person-verifier.ts'
  )
  let calls = 0
  const result = await verifyEmailViaOfficialGateway({
    email: 'claimed@example.com',
    apiKey: 'sk-official',
    baseUrl: 'https://gw.example/v1/',
    fetchImpl: async () => {
      calls += 1
      return new Response(
        JSON.stringify({ error: { code: 'hunter_claimed_email', message: 'hunter_claimed_email' } }),
        { status: 451 },
      )
    },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.message, OFFICIAL_DRAWER_CLAIMED)
  assert.equal(calls, 1)
})
})
