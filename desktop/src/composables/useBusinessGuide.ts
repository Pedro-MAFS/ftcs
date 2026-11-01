import { nextTick, ref, watch, type Ref } from 'vue'
import type { Router } from 'vue-router'
import { useRouter } from 'vue-router'
import { landingSettled, onLandingSettled } from './useDefaultLanding'
import { useMainViewTabs } from './useMainViewTabs'
import { useOnboarding } from './useOnboarding'

export interface GuideStepSpec {
  route: 'input' | 'profile' | 'explore' | 'leads' | 'email'
  guide: string
  title: string
  body: string
}

export const GUIDE_STEPS: GuideStepSpec[] = [
  {
    route: 'input',
    guide: 'og-input-generate',
    title: '录入资料',
    body: '在这一页放入产品官网或资料。勾选后点右上角「生成画像」，才会进入画像。',
  },
  {
    route: 'profile',
    guide: 'og-profile-new-explore',
    title: '确认画像',
    body: '在这一页查看并保存画像。点「新建探索任务」时会先按画像扩展关键词，再去找客户。',
  },
  {
    route: 'explore',
    guide: 'og-explore-start',
    title: '开始找客户',
    body: '在这一页选择全网搜索、社媒发现或地图发现，再点开始。打开网页使用内置浏览器。',
  },
  {
    route: 'leads',
    guide: 'og-leads-score',
    title: '查看线索',
    body: '探索结果在这一页。点「评分去重」会分成高、中、低，并去掉重复。',
  },
  {
    route: 'email',
    guide: 'og-email-batch-draft',
    title: '起草开发信',
    body: '在这一页为已评分线索起草开发信，再逐封查看。点「通过」只保存，不会真正发信。',
  },
]

const visible = ref(false)
const step = ref(0)

let guideDismissedThisProcess = false
let armed = false
let showToken = 0
let moving = false
let openWatchStarted = false
let routerRef: Router | null = null

function ensureWizardHidesGuide(): void {
  if (openWatchStarted) return
  openWatchStarted = true
  const { open } = useOnboarding()
  watch(open, (value) => {
    if (value) visible.value = false
  })
}

export function useBusinessGuide() {
  routerRef = useRouter()
  ensureWizardHidesGuide()

  return {
    visible,
    step,
    armAuto,
    replay,
    next,
    skipAll,
    dismissSession,
  }
}

function armAuto(): void {
  if (armed) return
  armed = true
  onLandingSettled(() => {
    void tryAutoShow()
  })
}

function replay(): void {
  guideDismissedThisProcess = false
  void presentFromStart('replay')
}

async function next(): Promise<void> {
  if (!visible.value || moving) return
  moving = true
  const token = showToken
  try {
    if (step.value >= GUIDE_STEPS.length - 1) {
      await mark('completed')
      if (token !== showToken) return
      visible.value = false
      return
    }
    const result = await revealStep(step.value + 1, token)
    if (result === 'blocked') visible.value = false
  } finally {
    moving = false
  }
}

async function skipAll(): Promise<void> {
  const token = ++showToken
  await mark('skipped')
  if (token !== showToken) return
  visible.value = false
}

function dismissSession(): void {
  guideDismissedThisProcess = true
  showToken += 1
  visible.value = false
}

async function tryAutoShow(): Promise<void> {
  if (visible.value || guideDismissedThisProcess || !landingSettled.value) return
  await presentFromStart('auto')
}

async function presentFromStart(reason: 'auto' | 'replay'): Promise<void> {
  const token = ++showToken
  if (reason === 'auto') {
    if (visible.value || guideDismissedThisProcess || !landingSettled.value) return
    const disposition = await readDisposition()
    if (token !== showToken || disposition !== 'pending' || guideDismissedThisProcess) return
  } else {
    visible.value = false
  }
  for (;;) {
    const ready = await waitUntilGuideMayShow(token)
    if (!ready || token !== showToken) return
    if (reason === 'auto') {
      if (guideDismissedThisProcess || !landingSettled.value) return
      const disposition = await readDisposition()
      if (token !== showToken || disposition !== 'pending') return
    }
    if (useOnboarding().open.value) continue
    const result = await revealStep(0, token)
    if (result === 'blocked') continue
    return
  }
}

async function revealStep(
  index: number,
  token: number,
): Promise<'shown' | 'blocked' | 'missing' | 'cancelled'> {
  const spec = GUIDE_STEPS[index]
  const router = routerRef
  if (!spec || !router || token !== showToken) return 'cancelled'
  if (useOnboarding().open.value) return 'blocked'
  if (router.currentRoute.value.name !== spec.route) {
    await useMainViewTabs().openPageTab(spec.route)
  }
  if (token !== showToken) return 'cancelled'
  if (useOnboarding().open.value) return 'blocked'
  const found = await waitForGuide(spec.guide)
  if (token !== showToken) return 'cancelled'
  if (useOnboarding().open.value) return 'blocked'
  if (!found) {
    visible.value = false
    return 'missing'
  }
  step.value = index
  visible.value = true
  if (useOnboarding().open.value) {
    visible.value = false
    return 'blocked'
  }
  return 'shown'
}

async function waitUntilGuideMayShow(token: number): Promise<boolean> {
  const { open } = useOnboarding()
  while (token === showToken) {
    if (open.value) {
      const closed = await waitUntilClosed(open, token)
      if (!closed || token !== showToken) return false
      continue
    }
    await nextTick()
    await twoFrames()
    if (token !== showToken) return false
    if (open.value) continue
    return true
  }
  return false
}

function waitUntilClosed(open: Ref<boolean>, token: number): Promise<boolean> {
  if (!open.value) return Promise.resolve(token === showToken)
  return new Promise((resolve) => {
    const stop = watch(open, (value) => {
      if (value) return
      stop()
      resolve(token === showToken)
    })
  })
}

function twoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForGuide(name: string): Promise<boolean> {
  await nextTick()
  for (let frame = 0; frame < 30; frame += 1) {
    const found = document.querySelector(`[data-guide="${name}"]`)
    if (found instanceof HTMLElement) return true
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  return false
}

async function readDisposition(): Promise<'pending' | 'completed' | 'skipped'> {
  if (!window.ftcs?.getBusinessGuideState) return 'pending'
  try {
    const state = await window.ftcs.getBusinessGuideState()
    if (
      state.disposition === 'completed' ||
      state.disposition === 'skipped' ||
      state.disposition === 'pending'
    ) {
      return state.disposition
    }
  } catch {
    return 'pending'
  }
  return 'pending'
}

async function mark(disposition: 'completed' | 'skipped'): Promise<void> {
  if (!window.ftcs?.markBusinessGuide) return
  await window.ftcs.markBusinessGuide(disposition)
}
