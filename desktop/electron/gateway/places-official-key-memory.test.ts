import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLACES_KEY_ARMING_RUN_ID,
  PLACES_KEY_ARMING_TTL_MS,
  createPlacesOfficialKeyMemory,
} from './places-official-key-memory.ts'

test('hold peek and clear stay in memory for one run', () => {
  const memory = createPlacesOfficialKeyMemory()
  const now = 1_000
  memory.hold({
    apiKey: 'AIzaMemory',
    expiresAt: null,
    keyVersion: 'v1',
    heldForRunId: 'run-1',
    heldAt: now,
  })
  const peeked = memory.peek('run-1', now + 10)
  assert.equal(peeked?.apiKey, 'AIzaMemory')
  assert.equal(peeked?.keyVersion, 'v1')
  memory.clear()
  assert.equal(memory.peek('run-1', now + 20), null)
})

test('expired and other-run keys are dropped', () => {
  const memory = createPlacesOfficialKeyMemory()
  memory.hold({
    apiKey: 'AIzaOld',
    expiresAt: '2026-10-12T00:00:00.000Z',
    keyVersion: 'v1',
    heldForRunId: 'run-1',
    heldAt: 1,
  })
  assert.equal(memory.peek('run-1', Date.parse('2026-10-12T00:00:01.000Z')), null)

  memory.hold({
    apiKey: 'AIzaOther',
    expiresAt: null,
    keyVersion: 'v2',
    heldForRunId: 'run-1',
    heldAt: 10,
  })
  assert.equal(memory.peek('run-2', 11), null)
  assert.equal(memory.peek('run-1', 12), null)
})

test('preflight hold can be adopted by the following run', () => {
  const memory = createPlacesOfficialKeyMemory()
  const heldAt = 5_000
  memory.hold({
    apiKey: 'AIzaArm',
    expiresAt: null,
    keyVersion: 'v9',
    heldForRunId: PLACES_KEY_ARMING_RUN_ID,
    heldAt,
  })
  const adopted = memory.peek('run-live', heldAt + 1_000)
  assert.equal(adopted?.apiKey, 'AIzaArm')
  assert.equal(adopted?.heldForRunId, 'run-live')
  assert.equal(memory.peek('run-live', heldAt + 1_100)?.keyVersion, 'v9')
  memory.clear()
  memory.hold({
    apiKey: 'AIzaStale',
    expiresAt: null,
    keyVersion: null,
    heldForRunId: PLACES_KEY_ARMING_RUN_ID,
    heldAt,
  })
  assert.equal(memory.peek('run-late', heldAt + PLACES_KEY_ARMING_TTL_MS + 1), null)
})
