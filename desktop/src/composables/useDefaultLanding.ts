import { nextTick, ref } from 'vue'
import type { Router } from 'vue-router'
import { useRouter } from 'vue-router'
import { landingSectionFromSteps } from './landing-section'
import { useMainViewTabs } from './useMainViewTabs'
import { pipelineSteps, whenPipelineReady } from './useWorkspace'

export const landingSettled = ref(false)

const TAKEOVER_ROUTES = new Set([
  'home',
  'browse',
  'empty',
  'input',
  'profile',
  'explore',
  'leads',
  'email',
  'settings',
])

type LandingListener = () => void

const listeners = new Set<LandingListener>()
let removeGuard: (() => void) | null = null
let watchingTakeover = false
let userTookOver = false
let replaceFromLanding = false
let inflight: Promise<void> | null = null

export function onLandingSettled(listener: LandingListener): () => void {
  if (landingSettled.value) {
    listener()
    return () => {}
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function markSettled(): void {
  const shouldNotify = !landingSettled.value
  landingSettled.value = true
  watchingTakeover = false
  removeGuard?.()
  removeGuard = null
  if (!shouldNotify) return
  const pending = [...listeners]
  listeners.clear()
  for (const listener of pending) listener()
}

function ensureGuard(router: Router): void {
  if (removeGuard || landingSettled.value) return
  removeGuard = router.beforeEach((to) => {
    if (!watchingTakeover || landingSettled.value || replaceFromLanding) return true
    const name = typeof to.name === 'string' ? to.name : ''
    if (TAKEOVER_ROUTES.has(name)) userTookOver = true
    return true
  })
}

async function peekConsumed(): Promise<boolean> {
  if (!window.ftcs?.peekDefaultLanding) return false
  const result = await window.ftcs.peekDefaultLanding()
  return result.consumed === true
}

async function commitConsumed(): Promise<void> {
  if (!window.ftcs?.commitDefaultLanding) return
  await window.ftcs.commitDefaultLanding()
}

export function useDefaultLanding() {
  const router = useRouter()
  ensureGuard(router)

  async function settle(): Promise<void> {
    if (landingSettled.value) return
    if (inflight) return inflight
    inflight = runSettle(router).finally(() => {
      inflight = null
    })
    return inflight
  }

  return { settle, landingSettled }
}

async function runSettle(router: Router): Promise<void> {
  ensureGuard(router)
  watchingTakeover = true
  userTookOver = false
  try {
    if (await peekConsumed()) {
      markSettled()
      return
    }
    await whenPipelineReady()
    if (landingSettled.value) return
    if (userTookOver) {
      await commitConsumed()
      markSettled()
      return
    }
    const name = landingSectionFromSteps(pipelineSteps.value)
    replaceFromLanding = true
    try {
      await useMainViewTabs().openPageTab(name)
      await nextTick()
    } finally {
      replaceFromLanding = false
    }
    if (userTookOver) {
      await commitConsumed()
      markSettled()
      return
    }
    await commitConsumed()
    markSettled()
  } finally {
    watchingTakeover = false
  }
}
