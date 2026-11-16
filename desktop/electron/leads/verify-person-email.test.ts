import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const here = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(here, 'electron-test-hook.mjs')).href)

const { verifyPersonEmail } = await import('./verify-person-email.ts')

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

test('官方抽屉验邮不读 Key、不请求 api.hunter.io', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-verify-official-'))
  writeLead(root)
  const previous = process.env.FTCS_CHANNEL_MODE
  process.env.FTCS_CHANNEL_MODE = 'official'
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
    assert.match(result.message, /不会直连 Hunter/)
    assert.equal(calls, 0)
    assert.equal(result.message.includes('hunter-secret-key'), false)
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.FTCS_CHANNEL_MODE
    else process.env.FTCS_CHANNEL_MODE = previous
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
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.FTCS_CHANNEL_MODE
    else process.env.FTCS_CHANNEL_MODE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
})
