import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { WorkflowPlan } from '../types/electron'

export const WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY =
  'ftcs.workflow.lastSelectedPlanId'

export const DEFAULT_WORKFLOW_PLAN_ID = 'builtin-standard' as const

export function readLastSelectedPlanId(availableIds: readonly string[]): string {
  try {
    const saved = localStorage.getItem(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY)
    if (saved && availableIds.includes(saved)) return saved
  } catch {
    // ignore quota / private mode
  }
  return DEFAULT_WORKFLOW_PLAN_ID
}

export function writeLastSelectedPlanId(planId: string): void {
  try {
    localStorage.setItem(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY, planId)
  } catch {
    // ignore
  }
}

export function resolveSelectedPlanId(
  availableIds: readonly string[],
  preferred?: string,
): string {
  if (preferred && availableIds.includes(preferred)) return preferred

  let saved: string | null = null
  try {
    saved = localStorage.getItem(WORKFLOW_LAST_SELECTED_PLAN_STORAGE_KEY)
  } catch {
    // ignore
  }

  if (saved && availableIds.includes(saved)) return saved

  const fallback = availableIds.includes(DEFAULT_WORKFLOW_PLAN_ID)
    ? DEFAULT_WORKFLOW_PLAN_ID
    : (availableIds[0] ?? DEFAULT_WORKFLOW_PLAN_ID)
  writeLastSelectedPlanId(fallback)
  return fallback
}

export function useWorkflowPlanSelection(options?: {
  onSelectedPlanIdChange?: (planId: string) => void
}): {
  plans: Ref<WorkflowPlan[]>
  loading: Ref<boolean>
  loadError: Ref<string>
  selectedPlanId: Ref<string>
  selectedPlan: ComputedRef<WorkflowPlan | undefined>
  reloadPlans: (preferred?: string) => Promise<void>
  onSelectPlan: (planId: string) => void
  selectPlanId: (planId: string) => void
  onPlanRemoved: (removedId: string) => void
} {
  const plans = ref<WorkflowPlan[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const selectedPlanId = ref('')

  const selectedPlan = computed(
    () => plans.value.find((plan) => plan.id === selectedPlanId.value),
  )

  function setSelectedPlanId(planId: string, persist = false): void {
    selectedPlanId.value = planId
    if (persist) writeLastSelectedPlanId(planId)
    options?.onSelectedPlanIdChange?.(planId)
  }

  async function reloadPlans(preferred?: string): Promise<void> {
    if (!window.ftcs?.listWorkflowPlans) {
      loadError.value = '桌面 API 不可用'
      plans.value = []
      return
    }

    loading.value = true
    loadError.value = ''
    try {
      const res = await window.ftcs.listWorkflowPlans()
      if (!res.ok) {
        loadError.value = res.message ?? '加载方案失败'
        plans.value = []
        return
      }

      plans.value = res.plans
      const ids = res.plans.map((plan) => plan.id)
      const next = resolveSelectedPlanId(
        ids,
        preferred ?? (selectedPlanId.value || undefined),
      )
      setSelectedPlanId(next)
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : String(err)
      plans.value = []
    } finally {
      loading.value = false
    }
  }

  function onSelectPlan(planId: string): void {
    if (!plans.value.some((plan) => plan.id === planId)) return
    setSelectedPlanId(planId, true)
  }

  function selectPlanId(planId: string): void {
    onSelectPlan(planId)
  }

  function onPlanRemoved(removedId: string): void {
    if (selectedPlanId.value !== removedId) return
    const ids = plans.value.map((plan) => plan.id).filter((id) => id !== removedId)
    const next = resolveSelectedPlanId(ids)
    setSelectedPlanId(next, true)
  }

  return {
    plans,
    loading,
    loadError,
    selectedPlanId,
    selectedPlan,
    reloadPlans,
    onSelectPlan,
    selectPlanId,
    onPlanRemoved,
  }
}
