import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPlacesGatewayReady,
  resolvePlacesStart,
} from './places-start.ts'

test('resolvePlacesStart: custom channel requires BYOK Places key', () => {
  const result = resolvePlacesStart({
    channelMode: 'custom',
    placesApiKeySet: false,
    placesProvider: 'custom',
    officialProvisioned: false,
  })
  assert.equal(result.ok, false)
  assert.match(result.detail, /Google Places API Key/)
})

test('resolvePlacesStart: custom channel with key allows custom provider', () => {
  const result = resolvePlacesStart({
    channelMode: 'custom',
    placesApiKeySet: true,
    placesProvider: 'custom',
    officialProvisioned: false,
  })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'custom')
})

test('resolvePlacesStart: official channel with BYOK allows custom provider', () => {
  const result = resolvePlacesStart({
    channelMode: 'official',
    placesApiKeySet: true,
    placesProvider: 'custom',
    officialProvisioned: true,
  })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'custom')
})

test('resolvePlacesStart: official channel without key requires BYOK', () => {
  const result = resolvePlacesStart({
    channelMode: 'official',
    placesApiKeySet: false,
    placesProvider: 'gateway',
    officialProvisioned: true,
  })
  assert.equal(result.ok, false)
  assert.match(result.detail, /BYOK|Places API Key/)
})

test('isPlacesGatewayReady stays false while E-10 deferred', () => {
  assert.equal(
    isPlacesGatewayReady({
      channelMode: 'official',
      placesProvider: 'gateway',
      officialProvisioned: true,
    }),
    false,
  )
})
