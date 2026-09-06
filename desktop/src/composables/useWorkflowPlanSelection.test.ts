import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  DEFAULT_WORKFLOW_PLAN_ID,
  readLastSelectedPlanId,
  resolveSelectedPlanId,
  writeLastSelectedPlanId,
  WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY,
} from './useWorkflowPlanSelection'

type StorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function createStorageMock(): { storage: Map<string, string>; mock: StorageMock } {
  const storage = new Map<string, string>()
  return {
    storage,
    mock: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value)
      },
      removeItem: (key) => {
        storage.delete(key)
      },
    },
  }
}

describe('useWorkflowPlanSelection memory', () => {
  let originalLocalStorage: Storage | undefined

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage
  })

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      Reflect.deleteProperty(globalThis, 'localStorage')
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })

  function installStorage(): Map<string, string> {
    const { storage, mock } = createStorageMock()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mock,
    })
    return storage
  }

  it('T1 readLastSelectedPlanId without storage returns builtin-standard', () => {
    installStorage()
    assert.equal(readLastSelectedPlanId(['builtin-standard']), DEFAULT_WORKFLOW_PLAN_ID)
  })

  it('T2 readLastSelectedPlanId returns saved id when valid', () => {
    const storage = installStorage()
    storage.set(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY, 'user_abcd1234')
    assert.equal(
      readLastSelectedPlanId(['builtin-standard', 'user_abcd1234']),
      'user_abcd1234',
    )
  })

  it('T3 resolveSelectedPlanId falls back to builtin-standard and writes storage', () => {
    const storage = installStorage()
    storage.set(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY, 'user_deleted')
    const resolved = resolveSelectedPlanId(['builtin-standard'])
    assert.equal(resolved, DEFAULT_WORKFLOW_PLAN_ID)
    assert.equal(storage.get(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY), DEFAULT_WORKFLOW_PLAN_ID)
  })

  it('T4 resolveSelectedPlanId prefers first available when builtin missing', () => {
    const storage = installStorage()
    const resolved = resolveSelectedPlanId(['user_first0001', 'user_second002'])
    assert.equal(resolved, 'user_first0001')
    assert.equal(storage.get(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY), 'user_first0001')
  })

  it('T5 writeLastSelectedPlanId persists selection', () => {
    const storage = installStorage()
    writeLastSelectedPlanId('user_saved001')
    assert.equal(storage.get(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY), 'user_saved001')
  })

  it('resolveSelectedPlanId honors preferred id when available', () => {
    installStorage()
    assert.equal(
      resolveSelectedPlanId(['builtin-standard', 'user_custom01'], 'user_custom01'),
      'user_custom01',
    )
  })
})
