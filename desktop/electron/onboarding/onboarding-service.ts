import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import type { OnboardingPhase, OnboardingState } from '../ipc/types'

export type { OnboardingPhase, OnboardingState }

const DEFAULT_STATE: OnboardingState = {
  version: 1,
  completed: false,
  skipped: false,
  phase: 'env',
  tourStep: 0,
  updatedAt: new Date(0).toISOString(),
}

function normalize(raw: Partial<OnboardingState> | undefined): OnboardingState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE }
  const phase = (['env', 'keys', 'tour', 'done'] as const).includes(
    raw.phase as OnboardingPhase,
  )
    ? (raw.phase as OnboardingPhase)
    : 'env'
  const tourStep =
    typeof raw.tourStep === 'number' && Number.isFinite(raw.tourStep)
      ? Math.max(0, Math.min(6, Math.floor(raw.tourStep)))
      : 0
  return {
    version: 1,
    completed: Boolean(raw.completed),
    skipped: Boolean(raw.skipped),
    phase,
    tourStep,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  }
}

export function getOnboardingState(): OnboardingState {
  return normalize(readUserPrefs().onboarding)
}

export function patchOnboardingState(
  patch: Partial<OnboardingState>,
): OnboardingState {
  const current = getOnboardingState()
  const next = normalize({
    ...current,
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  })
  writeUserPrefs({ onboarding: next })
  return next
}

/** 首次启动是否应自动弹出引导 */
export function shouldAutoOpenOnboarding(state = getOnboardingState()): boolean {
  return !state.completed && !state.skipped
}
