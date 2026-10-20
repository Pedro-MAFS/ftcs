import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPlacesGatewayReady,
  resolvePlacesStart,
} from './places-start.ts'

const base = {
  channelMode: 'custom' as const,
  placesApiKeySet: false,
  placesProvider: 'custom' as const,
  officialProvisioned: false,
}

test('resolvePlacesStart: custom channel without BYOK fails closed', () => {
  const result = resolvePlacesStart({
    ...base,
    channelMode: 'custom',
  })
  assert.equal(result.ok, false)
  assert.match(result.detail, /自备 Places Key/)
  assert.doesNotMatch(result.detail, /申请官方/)
})

test('resolvePlacesStart: custom channel with BYOK stays on the self-serve key', () => {
  const result = resolvePlacesStart({
    ...base,
    channelMode: 'custom',
    placesApiKeySet: true,
    officialProvisioned: true,
  })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'custom')
  assert.match(result.detail, /自备/)
  assert.match(result.detail, /本机直连/)
})

test('resolvePlacesStart: official channel ignores a stored BYOK key', () => {
  const result = resolvePlacesStart({
    ...base,
    channelMode: 'official',
    placesApiKeySet: true,
    officialProvisioned: true,
  })
  assert.equal(result.ok, false)
  assert.doesNotMatch(result.detail, /自备 Google/)
})

test('resolvePlacesStart: official fetch success does not require BYOK', () => {
  const result = resolvePlacesStart({
    ...base,
    channelMode: 'official',
    officialFetch: { ok: true, detail: '官方下发 Key（本机直连 Google）' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'custom')
  assert.match(result.detail, /官方下发 Key/)
  assert.match(result.detail, /本机直连/)
})

test('resolvePlacesStart: official arrears does not become BYOK', () => {
  const result = resolvePlacesStart({
    ...base,
    channelMode: 'official',
    placesApiKeySet: true,
    officialFetch: { ok: false, detail: '已欠费，请充值' },
  })
  assert.equal(result.ok, false)
  assert.equal(result.detail, '已欠费，请充值')
  assert.equal(result.provider, undefined)
})

test('isPlacesGatewayReady stays false when official places is active', () => {
  assert.equal(
    isPlacesGatewayReady({
      channelMode: 'official',
      placesProvider: 'gateway',
      officialProvisioned: true,
    }),
    false,
  )
})
