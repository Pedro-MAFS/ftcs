import { computed, ref } from 'vue'
import type { OnboardingPhase, OnboardingState } from '../types/onboarding'
import type { EnvProbeResult } from '../types/onboarding'

const DEFAULT_STATE: OnboardingState = {
  version: 1,
  completed: false,
  skipped: false,
  phase: 'env',
  tourStep: 0,
  updatedAt: new Date(0).toISOString(),
}

const open = ref(false)
const state = ref<OnboardingState>({ ...DEFAULT_STATE })
const probe = ref<EnvProbeResult | null>(null)
const probing = ref(false)
const busy = ref(false)
const error = ref('')
let bootstrapped = false

async function refreshState(): Promise<OnboardingState> {
  if (!window.ftcs?.getOnboardingState) {
    state.value = { ...DEFAULT_STATE }
    return state.value
  }
  state.value = await window.ftcs.getOnboardingState()
  return state.value
}

async function persist(patch: Partial<OnboardingState>): Promise<OnboardingState> {
  if (!window.ftcs?.setOnboardingState) {
    state.value = { ...state.value, ...patch }
    return state.value
  }
  state.value = await window.ftcs.setOnboardingState(patch)
  return state.value
}

async function runProbe(): Promise<EnvProbeResult | null> {
  if (!window.ftcs?.probeEnvironment) {
    error.value = '当前环境不支持环境探测'
    return null
  }
  probing.value = true
  error.value = ''
  try {
    probe.value = await window.ftcs.probeEnvironment()
    return probe.value
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    return null
  } finally {
    probing.value = false
  }
}

async function bootstrapOnboarding(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  if (!window.ftcs?.getOnboardingState) return
  try {
    const next = await refreshState()
    if (!next.completed && !next.skipped) {
      open.value = true
      if (next.phase === 'env') await runProbe()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function reopen(phase: OnboardingPhase = 'env'): Promise<void> {
  await persist({
    completed: false,
    skipped: false,
    phase: phase === 'done' ? 'env' : phase,
  })
  open.value = true
  if (phase === 'env' || phase === 'done') await runProbe()
}

async function skipAll(): Promise<void> {
  busy.value = true
  try {
    await persist({ skipped: true, completed: false, phase: 'env' })
    open.value = false
  } finally {
    busy.value = false
  }
}

async function goPhase(phase: OnboardingPhase): Promise<void> {
  await persist({ phase })
  if (phase === 'env') await runProbe()
}

async function completeAll(): Promise<void> {
  busy.value = true
  try {
    await persist({
      completed: true,
      skipped: false,
      phase: 'done',
    })
    open.value = false
  } finally {
    busy.value = false
  }
}

async function setTourStep(step: number): Promise<void> {
  await persist({ tourStep: step, phase: 'tour' })
}

export function useOnboarding() {
  const phase = computed(() => state.value.phase)
  const tourStep = computed(() => state.value.tourStep)
  const envOk = computed(() => probe.value?.ok === true)

  return {
    open,
    state,
    probe,
    probing,
    busy,
    error,
    phase,
    tourStep,
    envOk,
    bootstrapOnboarding,
    reopen,
    skipAll,
    goPhase,
    completeAll,
    setTourStep,
    runProbe,
    refreshState,
    persist,
  }
}
