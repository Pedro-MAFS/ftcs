import { computed, ref, watch, type MaybeRefOrGetter, type Ref, toValue } from 'vue'
import { useWorkspace } from './useWorkspace'
import { ensureAgentReady } from './useAgentPreflight'
import type { ExploreStartRound } from '../components/explore/ExploreStartControl.vue'

export const EXPLORE_ROUND_STORAGE_KEY = 'ftcs.explore.startRound'

function readSavedRound(): ExploreStartRound {
  try {
    const saved = localStorage.getItem(EXPLORE_ROUND_STORAGE_KEY)
    if (saved === 'R1' || saved === 'R2') return saved
  } catch {
    // ignore
  }
  return 'R1'
}

export function useExploreStart(options?: {
  maxQueriesLimit?: Ref<number | null>
  extraBusy?: MaybeRefOrGetter<boolean>
  onLaunch?: () => void
  onFail?: () => void
}) {
  const {
    activeProductId,
    currentExpansion,
    exploreTasks,
    generating,
    agentSkill,
    agentStatus,
    resetAgentForDiscoverLeads,
  } = useWorkspace()

  const exploreRound = ref<ExploreStartRound>(readSavedRound())
  const startingR1 = ref(false)
  const startingR2 = ref(false)

  const extraBusy = computed(() => Boolean(toValue(options?.extraBusy)))

  const allQueries = computed(() => currentExpansion.value?.search_queries ?? [])

  const hasKeywordsReady = computed(() =>
    (exploreTasks.value?.tasks ?? []).some((t) => t.status === 'keywords_ready'),
  )

  const r1QueryCount = computed(
    () => allQueries.value.filter((q) => q.round === 'R1').length,
  )

  const r2QueryCount = computed(
    () =>
      allQueries.value.filter((q) => q.round === 'R2' && Boolean(q.site_id?.trim()))
        .length,
  )

  const r2LegacyCount = computed(
    () =>
      allQueries.value.filter((q) => q.round === 'R2' && !q.site_id?.trim()).length,
  )

  const isLaunching = computed(
    () => startingR1.value || startingR2.value || extraBusy.value,
  )

  const canStartR1 = computed(() => {
    return (
      !!activeProductId.value &&
      hasKeywordsReady.value &&
      r1QueryCount.value > 0 &&
      !generating.value &&
      !isLaunching.value
    )
  })

  const canStartR2 = computed(() => {
    return (
      !!activeProductId.value &&
      hasKeywordsReady.value &&
      r2QueryCount.value > 0 &&
      !generating.value &&
      !isLaunching.value
    )
  })

  const startR1DisabledReason = computed(() => {
    if (generating.value || isLaunching.value) return '已有任务在运行'
    if (!hasKeywordsReady.value) return '请先完成关键词扩展'
    if (r1QueryCount.value > 0) return ''
    return '当前没有 R1 搜索词，请编辑关键词后重试'
  })

  const startR2DisabledReason = computed(() => {
    if (generating.value || isLaunching.value) return '已有任务在运行'
    if (!hasKeywordsReady.value) return '请先完成关键词扩展'
    if (r2QueryCount.value > 0) return ''
    if (r2LegacyCount.value > 0) return '当前 R2 词没有站点，请重新扩展关键词'
    return '没有可用的 R2 词。请在设置页启用社媒站点后重新扩展'
  })

  const canStartSelected = computed(() =>
    exploreRound.value === 'R2' ? canStartR2.value : canStartR1.value,
  )

  const startDisabledReason = computed(() =>
    exploreRound.value === 'R2'
      ? startR2DisabledReason.value
      : startR1DisabledReason.value,
  )

  const isDiscovering = computed(
    () =>
      generating.value &&
      (agentSkill.value === 'discover-leads' ||
        agentSkill.value === 'discover-leads-r2'),
  )

  const isStartingExplore = computed(
    () => startingR1.value || startingR2.value || isDiscovering.value,
  )

  watch(exploreRound, (value) => {
    try {
      localStorage.setItem(EXPLORE_ROUND_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  })

  /** 默认该轮全部词；若填写了正数上限则取 min(上限, 可用数) */
  function resolveMaxQueries(available: number): number {
    const limit = options?.maxQueriesLimit?.value
    if (limit == null || !Number.isFinite(limit) || limit <= 0) {
      return Math.max(1, available)
    }
    return Math.max(1, Math.min(Math.floor(limit), available || Math.floor(limit)))
  }

  async function startR1(): Promise<string> {
    if (!activeProductId.value || !window.ftcs?.startExploreR1) return ''
    if (!canStartR1.value) return startR1DisabledReason.value

    const preflightError = await ensureAgentReady('discover-leads')
    if (preflightError) return preflightError

    startingR1.value = true
    const maxQueries = resolveMaxQueries(r1QueryCount.value)
    resetAgentForDiscoverLeads(maxQueries, 'discover-leads')
    options?.onLaunch?.()

    try {
      const res = await window.ftcs.startExploreR1({
        productId: activeProductId.value,
        rounds: ['R1'],
        maxQueries,
      })
      if (!res.ok) {
        agentStatus.value = 'error'
        options?.onFail?.()
      }
      return res.message
    } catch (err) {
      agentStatus.value = 'error'
      options?.onFail?.()
      return err instanceof Error ? err.message : String(err)
    } finally {
      startingR1.value = false
    }
  }

  async function startR2(): Promise<string> {
    if (!activeProductId.value || !window.ftcs?.startExploreR2) return ''
    if (!canStartR2.value) return startR2DisabledReason.value

    const preflightError = await ensureAgentReady('discover-leads-r2')
    if (preflightError) return preflightError

    startingR2.value = true
    const maxQueries = resolveMaxQueries(r2QueryCount.value)
    resetAgentForDiscoverLeads(maxQueries, 'discover-leads-r2')
    options?.onLaunch?.()

    try {
      const res = await window.ftcs.startExploreR2({
        productId: activeProductId.value,
        maxQueries,
      })
      if (!res.ok) {
        agentStatus.value = 'error'
        options?.onFail?.()
      }
      return res.message
    } catch (err) {
      agentStatus.value = 'error'
      options?.onFail?.()
      return err instanceof Error ? err.message : String(err)
    } finally {
      startingR2.value = false
    }
  }

  async function startExplore(): Promise<string> {
    if (exploreRound.value === 'R2') return startR2()
    return startR1()
  }

  return {
    exploreRound,
    hasKeywordsReady,
    r1QueryCount,
    r2QueryCount,
    canStartSelected,
    startDisabledReason,
    isStartingExplore,
    startExplore,
  }
}
