import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { testHunterConnectivity } from './hunter-connectivity.ts'

describe('testHunterConnectivity', () => {
  it('官方通道不发 HTTP', async () => {
    let calls = 0
    const result = await testHunterConnectivity({
      env: {
        FTCS_CHANNEL_MODE: 'official',
        HUNTER_API_KEYS: 'hunter-secret',
        HUNTER_API_KEY: 'hunter-legacy',
      },
      fetchImpl: async () => {
        calls += 1
        throw new Error('should not fetch')
      },
    })
    assert.equal(calls, 0)
    assert.equal(result.ok, false)
    assert.equal(result.message, '官方通道不使用自备 Hunter Key')
    assert.deepEqual(result.keys, [])
  })

  it('自定义测试仍请求 api.hunter.io/v2/account', async () => {
    const calls: Array<{ url: string; key?: string }> = []
    const result = await testHunterConnectivity({
      env: {
        FTCS_CHANNEL_MODE: 'custom',
        HUNTER_API_KEY: 'hunter-secret-key',
      },
      fetchImpl: async (url, init) => {
        const headers = init?.headers as Record<string, string> | undefined
        calls.push({ url: String(url), key: headers?.['X-API-Key'] })
        return new Response(
          JSON.stringify({
            data: {
              plan_name: 'Free',
              reset_date: '2026-12-01',
              requests: { credits: { remaining: 3 } },
            },
          }),
          { status: 200 },
        )
      },
    })
    assert.equal(result.ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, 'https://api.hunter.io/v2/account')
    assert.equal(calls[0]?.key, 'hunter-secret-key')
    assert.equal(calls[0]?.url.includes('hunter/domain-search'), false)
  })
})
