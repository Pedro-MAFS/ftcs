import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { PlacesMcpInjection } from '../opencode/places-mcp-env.ts'
import { writePlacesKeySourceFile } from './places-key-source-store.ts'
import {
  createPlacesOfficialKeyMemory,
  type PlacesOfficialKeyMemory,
} from './places-official-key-memory.ts'
import type {
  PlacesCurrentResult,
  PlacesOfficialKeyClient,
  PlacesStatusBody,
  PlacesStatusResult,
} from './places-official-key-client.ts'
import {
  createPlacesOfficialService,
  type PlacesSelection,
} from './places-official-service.ts'

function statusBody(status: string, extra: Partial<PlacesStatusBody> = {}): PlacesStatusBody {
  return {
    status,
    reasonCode: null,
    reasonMessage: null,
    appliedAt: null,
    updatedAt: null,
    expectedReadyNote: status === 'pending' ? '预计下一自然日开通' : null,
    reapplyAllowed: status === 'none' || status === 'provision_failed',
    ...extra,
  }
}

function harness(options?: {
  selection?: PlacesSelection
  status?: PlacesStatusBody
  current?: PlacesCurrentResult
  applyResult?: PlacesStatusResult
}) {
  const calls = { apply: 0, status: 0, current: 0 }
  let selection: PlacesSelection = options?.selection || {
    channelMode: 'official',
    byokSet: false,
    byokKey: '',
  }
  let injection: PlacesMcpInjection = { kind: 'default' }
  let applied: PlacesMcpInjection = { kind: 'default' }
  const memory: PlacesOfficialKeyMemory = createPlacesOfficialKeyMemory()
  const http: PlacesOfficialKeyClient = {
    async apply() {
      calls.apply += 1
      return (
        options?.applyResult || {
          ok: true,
          httpStatus: 201,
          body: statusBody('pending'),
        }
      )
    },
    async getStatus() {
      calls.status += 1
      return { ok: true, httpStatus: 200, body: options?.status || statusBody('none') }
    },
    async getCurrent() {
      calls.current += 1
      return (
        options?.current || {
          ok: true,
          httpStatus: 200,
          material: { apiKey: 'AIzaLive', expiresAt: null, keyVersion: 'v2' },
        }
      )
    },
  }
  const service = createPlacesOfficialService({
    http,
    memory,
    ensureToken: async () => 'access-token',
    readSelection: () => selection,
    getInjection: () => injection,
    setInjection: (next) => {
      injection = next
    },
    injectionNeedsReload: () =>
      injection.kind !== applied.kind ||
      (injection.kind === 'official' &&
        applied.kind === 'official' &&
        injection.apiKey !== applied.apiKey),
    now: () => 10_000,
  })
  return {
    calls,
    service,
    memory,
    get selection() {
      return selection
    },
    get injection() {
      return injection
    },
    markApplied() {
      applied = injection.kind === 'official' ? { ...injection } : { kind: 'default' }
    },
  }
}

test('apply then queries status and never asks for the key', async () => {
  const h = harness({ status: statusBody('pending') })
  const result = await h.service.apply()
  assert.equal(result.ok, true)
  assert.equal(result.view.status, 'pending')
  assert.equal(result.view.expectedReadyNote, '预计下一自然日开通')
  assert.equal(h.calls.apply, 1)
  assert.equal(h.calls.status, 1)
  assert.equal(h.calls.current, 0)
  assert.equal(JSON.stringify(result).includes('apiKey'), false)
})

test('apply while revoked does not change the source or call get-key', async () => {
  const h = harness({
    selection: { channelMode: 'official', byokSet: true, byokKey: 'AIzaByok' },
    applyResult: {
      ok: false,
      httpStatus: 409,
      code: 'apply_while_revoked',
      message: '请联系客服',
    },
  })
  const result = await h.service.apply()
  assert.equal(result.ok, false)
  assert.equal(result.queried, false)
  assert.equal(result.view.status, null)
  assert.equal(result.message, '请联系客服')
  assert.equal(h.selection.channelMode, 'official')
  assert.equal(h.calls.current, 0)
})

test('refresh to active does not write a places source or touch BYOK', async () => {
  const h = harness({
    selection: { channelMode: 'official', byokSet: true, byokKey: 'AIzaByok' },
    status: statusBody('active'),
  })
  const result = await h.service.refresh()
  assert.equal(result.view.status, 'active')
  assert.equal(result.view.placesKeySource, 'official')
  assert.equal(h.calls.current, 0)
  assert.equal(h.selection.byokKey, 'AIzaByok')
  assert.equal(h.selection.channelMode, 'official')
})

test('401 need_login does not rewrite places status to revoked', async () => {
  const http: PlacesOfficialKeyClient = {
    async apply() {
      throw new Error('not used')
    },
    async getStatus() {
      return {
        ok: false,
        httpStatus: 401,
        code: 'need_login',
        message: '请先登录',
      }
    },
    async getCurrent() {
      throw new Error('settings must not get the key')
    },
  }
  const service = createPlacesOfficialService({
    http,
    memory: createPlacesOfficialKeyMemory(),
    ensureToken: async () => 'stale',
    readSelection: () => ({ channelMode: 'official', byokSet: false, byokKey: '' }),
    getInjection: () => ({ kind: 'default' }),
    setInjection: () => undefined,
    injectionNeedsReload: () => false,
  })
  const result = await service.refresh()
  assert.equal(result.ok, false)
  assert.equal(result.needLogin, true)
  assert.equal(result.view.status, null)
  assert.notEqual(result.view.status, 'revoked')
})

test('get-key failure does not switch the saved source to byok', async () => {
  const h = harness({
    selection: { channelMode: 'official', byokSet: true, byokKey: 'AIzaByok' },
    current: {
      ok: false,
      httpStatus: 200,
      code: 'arrears',
      message: '已欠费，请充值',
      status: 'arrears',
    },
  })
  const begun = await h.service.beginRun('run-1')
  assert.equal(begun.ok, false)
  assert.equal(begun.message, '已欠费，请充值')
  assert.doesNotMatch(begun.message, /自备/)
  assert.equal(h.selection.channelMode, 'official')
  assert.equal(h.memory.peek('run-1', 10_000), null)
})

test('custom channel uses BYOK and does not fetch the official key', async () => {
  const h = harness({
    selection: { channelMode: 'custom', byokSet: true, byokKey: 'AIzaByok' },
  })
  const begun = await h.service.beginRun('run-byok')
  assert.equal(begun.ok, true)
  assert.equal(begun.watchGoogleRejection, false)
  assert.equal(h.calls.current, 0)
  assert.match(begun.message, /自备/)
})

test('google rejection queries status once and does not fetch another key', async () => {
  const h = harness({
    selection: { channelMode: 'official', byokSet: true, byokKey: 'AIzaByok' },
    status: statusBody('arrears'),
  })
  h.memory.hold({
    apiKey: 'AIzaLive',
    expiresAt: null,
    keyVersion: 'v2',
    heldForRunId: 'run-1',
    heldAt: 10_000,
  })
  const message = await h.service.handleGoogleRejection(
    'Google Places Text Search HTTP 401: denied',
  )
  assert.equal(message, '已欠费，请充值')
  assert.equal(h.calls.status, 1)
  assert.equal(h.calls.current, 0)
  assert.equal(h.memory.peek('run-1', 10_000), null)

  const active = harness({ status: statusBody('active') })
  const google = 'Google Places HTTP 403: PERMISSION_DENIED'
  assert.equal(await active.service.handleGoogleRejection(google), google)
  assert.equal(active.calls.current, 0)
  assert.equal(active.calls.status, 1)
})

test('same run reuses the held key and a later run does not', async () => {
  const h = harness()
  const first = await h.service.beginRun('run-1')
  assert.equal(first.ok, true)
  assert.equal(first.watchGoogleRejection, true)
  assert.equal(h.calls.current, 1)
  h.markApplied()
  const again = await h.service.beginRun('run-1')
  assert.equal(again.ok, true)
  assert.equal(h.calls.current, 1)
  h.service.releaseRun()
  const next = await h.service.beginRun('run-2')
  assert.equal(next.ok, true)
  assert.equal(h.calls.current, 2)
})

test('source file stores only the source name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-places-'))
  const envPath = path.join(dir, '.env')
  fs.writeFileSync(envPath, 'GOOGLE_PLACES_API_KEY=AIzaByok\n', 'utf8')
  writePlacesKeySourceFile(envPath, 'custom')
  const text = fs.readFileSync(envPath, 'utf8')
  assert.match(text, /FTCS_PLACES_KEY_SOURCE=custom/)
  assert.match(text, /GOOGLE_PLACES_API_KEY=AIzaByok/)
  assert.doesNotMatch(text, /AIzaOfficial/)
  assert.equal(process.env.FTCS_PLACES_KEY_SOURCE, 'custom')
  delete process.env.FTCS_PLACES_KEY_SOURCE
})
