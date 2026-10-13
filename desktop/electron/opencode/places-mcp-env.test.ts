import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlacesMcpEnvironment,
  getPlacesMcpInjection,
  markPlacesMcpInjectionApplied,
  placesMcpInjectionNeedsReload,
  resetPlacesMcpInjectionState,
  setPlacesMcpInjection,
} from './places-mcp-env.ts'

test('official injection uses only the in-memory key and forces custom', () => {
  const env = buildPlacesMcpEnvironment({
    workspaceRoot: '/work',
    channelMode: 'official',
    envByok: 'AIzaByok',
    injection: { kind: 'official', apiKey: 'AIzaOfficial' },
  })
  assert.equal(env.PLACES_PROVIDER, 'custom')
  assert.equal(env.GOOGLE_PLACES_API_KEY, 'AIzaOfficial')
  assert.equal(JSON.stringify(env).includes('AIzaByok'), false)
  assert.equal('FTCS_PLACES_OFFICIAL_API_KEY' in env, false)
})

test('byok injection does not include an official key', () => {
  const env = buildPlacesMcpEnvironment({
    workspaceRoot: '/work',
    channelMode: 'custom',
    envByok: 'AIzaByok',
    injection: { kind: 'official', apiKey: 'AIzaOfficial' },
  })
  assert.equal(env.GOOGLE_PLACES_API_KEY, 'AIzaByok')
  assert.equal(JSON.stringify(env).includes('AIzaOfficial'), false)
  assert.equal(env.PLACES_PROVIDER, 'custom')
})

test('gateway provider in the workspace env is still custom', () => {
  const env = buildPlacesMcpEnvironment({
    workspaceRoot: '/work',
    channelMode: 'custom',
    envByok: 'AIzaByok',
    injection: { kind: 'default' },
  })
  assert.equal(env.PLACES_PROVIDER, 'custom')
  assert.equal(env.GOOGLE_PLACES_API_KEY, 'AIzaByok')
})

test('dropping an official injection forgets the key and still reloads the child', () => {
  resetPlacesMcpInjectionState()
  setPlacesMcpInjection({ kind: 'official', apiKey: 'AIzaSecret' })
  markPlacesMcpInjectionApplied()
  setPlacesMcpInjection({ kind: 'default' })
  assert.equal(getPlacesMcpInjection().kind, 'default')
  assert.equal(placesMcpInjectionNeedsReload(), true)
  assert.equal(JSON.stringify(getPlacesMcpInjection()).includes('AIzaSecret'), false)
  resetPlacesMcpInjectionState()
})

test('official source without an injection does not fall back to BYOK', () => {
  const env = buildPlacesMcpEnvironment({
    workspaceRoot: '/work',
    channelMode: 'official',
    envByok: 'AIzaByok',
    injection: { kind: 'default' },
  })
  assert.equal(env.GOOGLE_PLACES_API_KEY, undefined)
  assert.equal(env.PLACES_PROVIDER, 'custom')
})
