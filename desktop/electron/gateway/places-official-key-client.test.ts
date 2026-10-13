import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLACES_OFFICIAL_APPLY_PATH,
  PLACES_OFFICIAL_CURRENT_PATH,
  PLACES_OFFICIAL_STATUS_PATH,
  createPlacesOfficialKeyClient,
} from './places-official-key-client.ts'

const BASE = 'https://token.ai-utills.com/v1'

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
  }
}

test('client calls the three live gateway paths and keeps apiKey off status', async () => {
  const calls: Array<{ url: string; method: string; auth: string; body?: string }> = []
  const client = createPlacesOfficialKeyClient({
    baseUrl: BASE,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url,
        method: init?.method || 'GET',
        auth: headers.get('Authorization') || '',
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      if (url.endsWith(PLACES_OFFICIAL_APPLY_PATH)) {
        return jsonResponse(201, {
          status: 'pending',
          reasonCode: null,
          reasonMessage: null,
          appliedAt: '2026-10-12T00:00:00.000Z',
          updatedAt: '2026-10-12T00:00:00.000Z',
          expectedReadyNote: '预计下一自然日开通',
          reapplyAllowed: false,
          apiKey: 'should-not-leak',
        })
      }
      if (url.endsWith(PLACES_OFFICIAL_STATUS_PATH)) {
        return jsonResponse(200, {
          status: 'active',
          reasonCode: null,
          reasonMessage: null,
          expectedReadyNote: null,
          apiKey: 'should-not-leak',
        })
      }
      return jsonResponse(200, {
        apiKey: 'AIzaOfficial',
        expiresAt: null,
        keyVersion: 'v3',
      })
    },
  })

  const applied = await client.apply('token-1')
  assert.equal(applied.ok, true)
  if (applied.ok) {
    assert.equal(applied.body.status, 'pending')
    assert.equal('apiKey' in applied.body, false)
    assert.equal(JSON.stringify(applied.body).includes('should-not-leak'), false)
  }
  const status = await client.getStatus('token-1')
  assert.equal(status.ok, true)
  if (status.ok) {
    assert.equal(JSON.stringify(status.body).includes('should-not-leak'), false)
    assert.equal(status.body.status, 'active')
  }
  const current = await client.getCurrent('token-1')
  assert.equal(current.ok, true)
  if (current.ok) {
    assert.equal(current.material.apiKey, 'AIzaOfficial')
    assert.equal(current.material.keyVersion, 'v3')
  }

  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      `POST ${BASE}${PLACES_OFFICIAL_APPLY_PATH}`,
      `GET ${BASE}${PLACES_OFFICIAL_STATUS_PATH}`,
      `GET ${BASE}${PLACES_OFFICIAL_CURRENT_PATH}`,
    ],
  )
  assert.equal(calls[0].auth, 'Bearer token-1')
  assert.equal(calls[0].body, '{}')
})

test('unauthenticated gateway body maps to need_login and arrears returns no key', async () => {
  const client = createPlacesOfficialKeyClient({
    baseUrl: BASE,
    fetchImpl: async (url) => {
      if (url.endsWith('/current')) {
        return jsonResponse(200, {
          status: 'arrears',
          reasonCode: null,
          reasonMessage: '已欠费，请充值',
          expectedReadyNote: null,
        })
      }
      return jsonResponse(401, { code: 'need_login', message: '请先登录' })
    },
  })
  const status = await client.getStatus('nope')
  assert.equal(status.ok, false)
  if (!status.ok) {
    assert.equal(status.code, 'need_login')
    assert.equal(status.httpStatus, 401)
    assert.equal(status.status, undefined)
  }
  const current = await client.getCurrent('nope')
  assert.equal(current.ok, false)
  if (!current.ok) {
    assert.equal(current.code, 'arrears')
    assert.equal(current.status, 'arrears')
    assert.equal('apiKey' in current, false)
  }
})

test('apply conflict and get-current not_active keep the server code', async () => {
  const client = createPlacesOfficialKeyClient({
    baseUrl: BASE,
    fetchImpl: async (url, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(409, {
          code: 'apply_while_revoked',
          message: '请联系客服',
        })
      }
      return jsonResponse(403, {
        code: 'not_active',
        message: '尚未开通',
        status: 'pending',
      })
    },
  })
  const applied = await client.apply('token')
  assert.equal(applied.ok, false)
  if (!applied.ok) assert.equal(applied.code, 'apply_while_revoked')
  const current = await client.getCurrent('token')
  assert.equal(current.ok, false)
  if (!current.ok) {
    assert.equal(current.code, 'not_active')
    assert.equal(current.status, 'pending')
  }
})

test('network failure does not invent a places status', async () => {
  const client = createPlacesOfficialKeyClient({
    baseUrl: BASE,
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED')
    },
  })
  const status = await client.getStatus('token')
  assert.equal(status.ok, false)
  if (!status.ok) {
    assert.equal(status.code, 'network')
    assert.equal(status.status, undefined)
  }
})
