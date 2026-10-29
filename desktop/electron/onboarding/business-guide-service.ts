import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import type { BusinessGuideState } from '../ipc/types'

export type { BusinessGuideState }

const DISPOSITIONS = ['pending', 'completed', 'skipped'] as const

function pendingState(): BusinessGuideState {
  return {
    version: 1,
    disposition: 'pending',
    updatedAt: new Date().toISOString(),
  }
}

function readStored(): BusinessGuideState | null {
  const raw = readUserPrefs().businessGuide
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== 1) return null
  if (!DISPOSITIONS.includes(raw.disposition)) return null
  if (typeof raw.updatedAt !== 'string' || !raw.updatedAt) return null
  return {
    version: 1,
    disposition: raw.disposition,
    updatedAt: raw.updatedAt,
  }
}

/** 缺字段、版本不对或 disposition 非法时只在内存里当成 pending，不写回磁盘。 */
export function getBusinessGuideState(): BusinessGuideState {
  return readStored() ?? pendingState()
}

export function markBusinessGuide(
  disposition: 'completed' | 'skipped',
): BusinessGuideState {
  if (disposition !== 'completed' && disposition !== 'skipped') {
    throw new Error('invalid business guide disposition')
  }
  const next: BusinessGuideState = {
    version: 1,
    disposition,
    updatedAt: new Date().toISOString(),
  }
  writeUserPrefs({ businessGuide: next })
  return next
}
