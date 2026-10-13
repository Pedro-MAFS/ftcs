import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ARREARS_MESSAGE,
  BYOK_PLACES_DETAIL,
  OFFICIAL_PLACES_DETAIL,
  PLACES_DISCOVERY_SNIPPET,
  REVOKED_MESSAGE,
  canApplyPlacesOfficialKey,
  detailForOfficialKeyFailure,
  googleRejectionFromToolPart,
  messageAfterGoogleRejectedKey,
  planPlacesRun,
  placesByokPersistedForChannel,
  placesSourceForChannel,
  resolvePlacesEffectiveKey,
} from './places-official.ts'

test('canApplyPlacesOfficialKey follows login and status', () => {
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: false, status: 'none' }), false)
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: true, status: 'pending' }), false)
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: true, status: 'active' }), false)
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: true, status: 'arrears' }), false)
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: true, status: 'revoked' }), false)
  assert.equal(canApplyPlacesOfficialKey({ loggedIn: true, status: 'none' }), true)
  assert.equal(
    canApplyPlacesOfficialKey({ loggedIn: true, status: 'provision_failed' }),
    true,
  )
})

test('places source follows the model channel', () => {
  assert.equal(placesSourceForChannel('official'), 'official')
  assert.equal(placesSourceForChannel('custom'), 'custom')
  assert.equal(placesSourceForChannel(undefined), 'official')
  assert.equal(placesByokPersistedForChannel('official'), false)
  assert.equal(placesByokPersistedForChannel('custom'), true)
})

test('official channel does not use BYOK even when a key is stored', () => {
  const result = resolvePlacesEffectiveKey({
    channelMode: 'official',
    byokSet: true,
    officialStatus: 'active',
  })
  assert.equal(result.ok, true)
  assert.equal(result.source, 'official')
  assert.equal(result.detail, OFFICIAL_PLACES_DETAIL)
  assert.equal(
    planPlacesRun({ channelMode: 'official', byokSet: true }).action,
    'fetch-official',
  )
})

test('custom channel uses BYOK and does not fetch the official key', () => {
  const ready = resolvePlacesEffectiveKey({
    channelMode: 'custom',
    byokSet: true,
    officialStatus: 'active',
  })
  assert.equal(ready.ok, true)
  assert.equal(ready.source, 'custom')
  assert.equal(ready.detail, BYOK_PLACES_DETAIL)
  assert.equal(planPlacesRun({ channelMode: 'custom', byokSet: true }).action, 'use-byok')

  const missing = resolvePlacesEffectiveKey({
    channelMode: 'custom',
    byokSet: false,
    officialStatus: 'active',
  })
  assert.equal(missing.ok, false)
  assert.match(missing.detail, /自备 Places Key/)
  assert.equal(planPlacesRun({ channelMode: 'custom', byokSet: false }).action, 'fail')
})

test('official arrears or revoked does not offer a BYOK switch', () => {
  for (const status of ['arrears', 'revoked'] as const) {
    const result = resolvePlacesEffectiveKey({
      channelMode: 'official',
      byokSet: true,
      officialStatus: status,
    })
    assert.equal(result.ok, false)
    assert.equal(result.source, 'none')
    assert.equal(result.offer, null)
    assert.doesNotMatch(result.detail, /自备/)
  }
})

test('official pending stays blocked', () => {
  const result = resolvePlacesEffectiveKey({
    channelMode: 'official',
    byokSet: false,
    officialStatus: 'pending',
  })
  assert.equal(result.ok, false)
  assert.notEqual(result.source, 'custom')
  assert.match(result.detail, /申请中/)
})

test('get-key failures name the reason and do not imply a BYOK fallback', () => {
  const arrears = detailForOfficialKeyFailure({
    code: 'arrears',
    status: 'arrears',
    byokSet: false,
  })
  assert.equal(arrears.detail, ARREARS_MESSAGE)
  assert.equal(arrears.offer, null)

  const revoked = detailForOfficialKeyFailure({
    code: 'revoked',
    status: 'revoked',
    byokSet: true,
  })
  assert.equal(revoked.detail, REVOKED_MESSAGE)
  assert.equal(revoked.offer, null)
  assert.doesNotMatch(revoked.detail, /自备/)

  const login = detailForOfficialKeyFailure({
    code: 'need_login',
    byokSet: true,
  })
  assert.equal(login.needLogin, true)
  assert.equal(login.offer, 'relogin')
})

test('Google rejection during a task only replaces arrears', () => {
  assert.equal(
    messageAfterGoogleRejectedKey({
      googleMessage: 'Google Places HTTP 401: REQUEST_DENIED',
      status: 'arrears',
      statusQueryOk: true,
    }),
    ARREARS_MESSAGE,
  )
  assert.equal(
    messageAfterGoogleRejectedKey({
      googleMessage: 'Google Places HTTP 403: PERMISSION_DENIED',
      status: 'revoked',
      statusQueryOk: true,
    }),
    'Google Places HTTP 403: PERMISSION_DENIED',
  )
  assert.equal(
    messageAfterGoogleRejectedKey({
      googleMessage: 'Google Places HTTP 401',
      status: null,
      statusQueryOk: false,
    }),
    'Google Places HTTP 401',
  )
})

test('places tool 401 is a Google rejection and a normal result is not', () => {
  const rejected = googleRejectionFromToolPart({
    tool: 'places_text_search',
    state: {
      status: 'completed',
      output: JSON.stringify({
        error: true,
        code: 'PLACES_HTTP_ERROR',
        message: 'Google Places Text Search HTTP 401: denied',
        http_status: 401,
      }),
    },
  })
  assert.equal(rejected, 'Google Places Text Search HTTP 401: denied')
  assert.equal(
    googleRejectionFromToolPart({
      tool: 'search_web',
      state: { output: '{"code":"PLACES_HTTP_ERROR","http_status":401}' },
    }),
    null,
  )
  assert.equal(
    googleRejectionFromToolPart({
      tool: 'place_details',
      state: { output: '{"places":[{"displayName":"Acme"}]}' },
    }),
    null,
  )
})

test('R3 prompt and skill use the verified-website snippet', () => {
  assert.match(PLACES_DISCOVERY_SNIPPET, /经官网核实/)
  assert.doesNotMatch(PLACES_DISCOVERY_SNIPPET, /place_id=/)
  const prompt = readFileSync(
    new URL('../../electron/opencode/agent-runner.ts', import.meta.url),
    'utf8',
  )
  const skill = readFileSync(
    new URL('../../../workspace/skills/discover-leads-r3/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(prompt, /经官网核实/)
  assert.match(skill, /经官网核实/)
  assert.doesNotMatch(prompt, /place_id=/)
  assert.doesNotMatch(skill, /place_id=/)
  const settings = readFileSync(
    new URL('../../electron/settings/settings-service.ts', import.meta.url),
    'utf8',
  )
  const snapshot = settings.slice(
    settings.indexOf('export interface SettingsSnapshot'),
    settings.indexOf('export interface SettingsSaveInput'),
  )
  assert.doesNotMatch(snapshot, /placesOfficialApiKey|placesOfficialKeySet/)
  assert.equal(snapshot.includes('apiKey:'), false)
})
