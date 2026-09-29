import { computed, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { useWorkspace } from './useWorkspace'
import { ensureAgentReady } from './useAgentPreflight'
import type { ExploreStartRound } from '../components/explore/ExploreStartControl.vue'

export const EXPLORE_ROUND_STORAGE_KEY = 'ftcs.explore.startRound'

function readSavedRound(): ExploreStartRound {
  try {
    const saved = localStorage.getItem(EXPLORE_ROUND_STORAGE_KEY)
    if (saved === 'R1' || saved === 'R2' || saved === 'R3') return saved
  } catch {
    // ignore
  }
  return 'R1'
}

export function useExploreStart(options?: {
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
  const startingR3 = ref(false)

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

  const r3QueryCount = computed(
    () =>
      allQueries.value.filter(
        (q) => q.round === 'R3' && !String(q.site_id || '').trim(),
      ).length,
  )

  const r2LegacyCount = computed(
    () =>
      allQueries.value.filter((q) => q.round === 'R2' && !q.site_id?.trim()).length,
  )

  const isLaunching = computed(
    () =>
      startingR1.value || startingR2.value || startingR3.value || extraBusy.value,
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

  const canStartR3 = computed(() => {
    return (
      !!activeProductId.value &&
      hasKeywordsReady.value &&
      r3QueryCount.value > 0 &&
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

  const startR3DisabledReason = computed(() => {
    if (generating.value || isLaunching.value) return '已有任务在运行'
    if (!hasKeywordsReady.value) return '请先完成关键词扩展'
    if (r3QueryCount.value > 0) return ''
    return '当前没有 R3 地图发现词，请重新扩展关键词'
  })

  const canStartSelected = computed(() => {
    if (exploreRound.value === 'R3') return canStartR3.value
    if (exploreRound.value === 'R2') return canStartR2.value
    return canStartR1.value
  })

  const startDisabledReason = computed(() => {
    if (exploreRound.value === 'R3') return startR3DisabledReason.value
    if (exploreRound.value === 'R2') return startR2DisabledReason.value
    return startR1DisabledReason.value
  })

  const isDiscovering = computed(
    () =>
      generating.value &&
      (agentSkill.value === 'discover-leads' ||
        agentSkill.value === 'discover-leads-r2' ||
        agentSkill.value === 'discover-leads-r3'),
  )

  const isStartingExplore = computed(
    () =>
      startingR1.value ||
      startingR2.value ||
      startingR3.value ||
      isDiscovering.value,
  )

  watch(exploreRound, (value) => {
    try {
      localStorage.setItem(EXPLORE_ROUND_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  })

  /** 该轮合格词全部执行，不再接受页面上的词数上限 */
  function resolveMaxQueries(available: number): number {
    return Math.max(1, available)
  }

  async function startR1(): Promise<{ ok: boolean; message: string }> {
    if (!activeProductId.value || !window.ftcs?.startExploreR1) {
      return { ok: false, message: '' }
    }
    if (!canStartR1.value) {
      return { ok: false, message: startR1DisabledReason.value }
    }

    const preflightError = await ensureAgentReady('discover-leads')
    if (preflightError) return { ok: false, message: preflightError }

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
      return { ok: res.ok, message: res.message }
    } catch (err) {
      agentStatus.value = 'error'
      options?.onFail?.()
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      startingR1.value = false
    }
  }

  async function startR2(): Promise<{ ok: boolean; message: string }> {
    if (!activeProductId.value || !window.ftcs?.startExploreR2) {
      return { ok: false, message: '' }
    }
    if (!canStartR2.value) {
      return { ok: false, message: startR2DisabledReason.value }
    }

    const preflightError = await ensureAgentReady('discover-leads-r2')
    if (preflightError) return { ok: false, message: preflightError }

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
      return { ok: res.ok, message: res.message }
    } catch (err) {
      agentStatus.value = 'error'
      options?.onFail?.()
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      startingR2.value = false
    }
  }

  async function startR3(): Promise<{ ok: boolean; message: string }> {
    if (!activeProductId.value || !window.ftcs?.startExploreR3) {
      return { ok: false, message: '' }
    }
    if (!canStartR3.value) {
      return { ok: false, message: startR3DisabledReason.value }
    }

    const preflightError = await ensureAgentReady('discover-leads-r3')
    if (preflightError) return { ok: false, message: preflightError }

    startingR3.value = true
    const maxQueries = resolveMaxQueries(r3QueryCount.value)
    resetAgentForDiscoverLeads(maxQueries, 'discover-leads-r3')
    options?.onLaunch?.()

    try {
      const res = await window.ftcs.startExploreR3({
        productId: activeProductId.value,
        maxQueries,
      })
      if (!res.ok) {
        agentStatus.value = 'error'
        options?.onFail?.()
      }
      return { ok: res.ok, message: res.message }
    } catch (err) {
      agentStatus.value = 'error'
      options?.onFail?.()
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      startingR3.value = false
    }
  }

  async function startExplore(): Promise<string> {
    if (exploreRound.value === 'R3') return (await startR3()).message
    if (exploreRound.value === 'R2') return (await startR2()).message
    return (await startR1()).message
  }

  return {
    exploreRound,
    hasKeywordsReady,
    r1QueryCount,
    r2QueryCount,
    r3QueryCount,
    canStartR1,
    canStartR2,
    canStartR3,
    startR1DisabledReason,
    startR2DisabledReason,
    startR3DisabledReason,
    canStartSelected,
    startDisabledReason,
    isStartingExplore,
    startExplore,
    startR1,
    startR2,
    startR3,
  }
}
