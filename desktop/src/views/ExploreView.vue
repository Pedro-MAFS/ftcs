<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import { useExploreStart } from '../composables/useExploreStart'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import { showToast } from '../composables/useToast'
import Icon from '../components/shared/Icon.vue'
import ExploreStartControl from '../components/explore/ExploreStartControl.vue'
import KeywordEditorDialog from '../components/shared/KeywordEditorDialog.vue'
import type { ExploreTaskDto, ExploreR2SiteDto, KeywordExpansionDto } from '../types/electron'
import {
  R3_EMPTY,
  R4_PLANNED_EMPTY,
  ROUND_FILTER_OPTIONS,
  roundLabel,
} from '../explore/round-labels'

const meta = SECTION_META.explore
const router = useRouter()
const {
  activeProductId,
  activeProduct,
  exploreTasks,
  currentExpansion,
  generating,
  agentSkill,
  agentStatus,
  refreshExploreTasks,
  resetAgentForScoreAndDedupe,
} = useWorkspace()

const expandedId = ref('')
const actionMessage = ref('')
const loading = ref(false)

watch(actionMessage, (msg) => {
  const text = msg.trim()
  if (!text) return
  showToast(text)
  actionMessage.value = ''
})
const editorOpen = ref(false)
const scoringLeads = ref(false)
const previewRound = ref('R1')
const previewDimension = ref('all')

let progressTimer: ReturnType<typeof setInterval> | null = null

const DIMENSION_OPTIONS = [
  { value: 'all', label: '全部维度' },
  { value: 'product', label: '产品' },
  { value: 'scenario', label: '场景' },
  { value: 'buyer', label: '买家' },
  { value: 'geo', label: '地理' },
  { value: 'competitor', label: '竞品' },
]

const ROUND_OPTIONS = ROUND_FILTER_OPTIONS

const DIM_LABEL: Record<string, string> = {
  product: '产品',
  scenario: '场景',
  buyer: '买家',
  geo: '地理',
  competitor: '竞品',
}

const tasks = computed(() => exploreTasks.value?.tasks ?? [])
const summary = computed(
  () =>
    exploreTasks.value?.summary ?? {
      total: 0,
      keywordsReady: 0,
      running: 0,
      completed: 0,
      failed: 0,
    },
)

const allQueries = computed(() => currentExpansion.value?.search_queries ?? [])

const filteredQueries = computed(() => {
  return allQueries.value.filter((q) => {
    if (previewRound.value !== 'all' && q.round !== previewRound.value) return false
    if (previewDimension.value !== 'all' && q.dimension !== previewDimension.value) {
      return false
    }
    return !!q.query?.trim()
  })
})

const r2Sites = ref<ExploreR2SiteDto[]>([])

const previewTitle = computed(() => {
  const round =
    previewRound.value === 'all' ? '全部轮次' : roundLabel(previewRound.value)
  const dim =
    previewDimension.value === 'all'
      ? '全部维度'
      : DIM_LABEL[previewDimension.value] || previewDimension.value
  return `搜索词预览 · ${round} · ${dim} · ${filteredQueries.value.length} 条`
})

const previewEmptyText = computed(() => {
  if (previewRound.value === 'R4') return R4_PLANNED_EMPTY
  if (previewRound.value === 'R3') return R3_EMPTY
  return '当前筛选下无搜索词'
})

function queryPreviewMeta(q: KeywordExpansionDto['search_queries'][number]): string {
  const dim = DIM_LABEL[q.dimension] || q.dimension
  if (q.round === 'R3') return `${dim} · R3 地图发现`
  if (q.round !== 'R2') return `${dim} · ${q.round}`
  const site = r2Sites.value.find((s) => s.id === q.site_id)
  if (site) return `${dim} · R2 · ${site.label}`
  if (q.site_id) return `${dim} · R2 · ${q.site_id}`
  return `${dim} · R2 · 旧格式`
}

async function loadR2Sites(): Promise<void> {
  if (!window.ftcs?.getExploreR2Sites) return
  try {
    const res = await window.ftcs.getExploreR2Sites()
    if (res.ok) r2Sites.value = res.sites
  } catch {
    // ignore
  }
}

const expandingPlaceholder = computed(() => {
  return (
    generating.value &&
    agentSkill.value === 'expand-keywords' &&
    !tasks.value.some((t) => t.status === 'keywords_ready')
  )
})

const discoveringPlaceholder = computed(() => {
  return (
    generating.value &&
    agentSkill.value === 'discover-leads' &&
    !tasks.value.some((t) => t.status === 'running')
  )
})

const discoveringR2Placeholder = computed(() => {
  return (
    generating.value &&
    agentSkill.value === 'discover-leads-r2' &&
    !tasks.value.some((t) => t.status === 'running')
  )
})

const discoveringR3Placeholder = computed(() => {
  return (
    generating.value &&
    agentSkill.value === 'discover-leads-r3' &&
    !tasks.value.some((t) => t.status === 'running')
  )
})

const isScoring = computed(
  () =>
    scoringLeads.value ||
    (generating.value && agentSkill.value === 'score-and-dedupe'),
)

function stopProgressPolling(): void {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

function startProgressPolling(): void {
  stopProgressPolling()
  progressTimer = setInterval(() => {
    void refreshExploreTasks().then(() => {
      const running = tasks.value.find((t) => t.status === 'running')
      if (running) expandedId.value = running.id
    })
  }, 2500)
}

const statusLabel = (status: ExploreTaskDto['status']): string => {
  if (status === 'keywords_ready') return '关键词就绪'
  if (status === 'running') return '运行中'
  if (status === 'failed') return '失败'
  return '已完成'
}

const statusTone = (status: ExploreTaskDto['status']): string => {
  if (status === 'keywords_ready') return 'success'
  if (status === 'running') return 'accent'
  if (status === 'failed') return 'warning'
  return 'muted'
}

function progressPct(task: ExploreTaskDto): number {
  if (!task.totalQueries) return 0
  return Math.min(100, Math.round((task.queriesExecuted / task.totalQueries) * 100))
}

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? '' : id
}

async function reload(): Promise<void> {
  loading.value = true
  actionMessage.value = ''
  try {
    await refreshExploreTasks()
  } finally {
    loading.value = false
  }
}

async function stopAgent(): Promise<void> {
  if (!window.ftcs?.abortProfile) return
  await window.ftcs.abortProfile()
  actionMessage.value = '已请求停止当前任务'
  stopProgressPolling()
}

const {
  exploreRound,
  hasKeywordsReady,
  canStartSelected,
  startDisabledReason,
  isStartingExplore,
  startExplore: runExploreStart,
} = useExploreStart({
  extraBusy: () => scoringLeads.value,
  onLaunch: startProgressPolling,
  onFail: stopProgressPolling,
})

async function startExplore(): Promise<void> {
  actionMessage.value = await runExploreStart()
}

function goLeads(task?: ExploreTaskDto): void {
  if (task && task.status !== 'keywords_ready') {
    router
      .push({ name: 'leads', query: { runId: task.id } })
      .catch(() => undefined)
    return
  }
  router.push({ name: 'leads' }).catch(() => undefined)
}

async function startScoreAndDedupe(task: ExploreTaskDto): Promise<void> {
  if (!activeProductId.value || !window.ftcs?.scoreAndDedupeLeads) return
  if (generating.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }
  if (task.status !== 'completed' || task.leadsFound <= 0) {
    actionMessage.value = '该任务没有可评分的线索'
    return
  }

  const preflightError = await ensureAgentReady('score-and-dedupe')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  scoringLeads.value = true
  actionMessage.value = ''
  resetAgentForScoreAndDedupe(task.leadsFound)

  try {
    const res = await window.ftcs.scoreAndDedupeLeads(activeProductId.value)
    if (!res.ok) {
      actionMessage.value = res.message
      agentStatus.value = 'error'
      return
    }
    actionMessage.value = res.message
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    agentStatus.value = 'error'
  } finally {
    scoringLeads.value = false
  }
}

function openKeywordEditor(): void {
  if (!activeProductId.value) return
  editorOpen.value = true
}

function closeKeywordEditor(): void {
  editorOpen.value = false
}

async function onKeywordsSaved(expansion: KeywordExpansionDto): Promise<void> {
  editorOpen.value = false
  actionMessage.value = `已保存 ${expansion.stats.total_queries} 条搜索词`
  await refreshExploreTasks()
  const ready = tasks.value.find((t) => t.status === 'keywords_ready')
  if (ready) expandedId.value = ready.id
}

watch(
  () => tasks.value,
  (list) => {
    if (!list.length) {
      expandedId.value = ''
      return
    }
    const ready = list.find((t) => t.status === 'keywords_ready')
    if (ready && !expandedId.value) {
      expandedId.value = ready.id
      return
    }
    if (expandedId.value && !list.some((t) => t.id === expandedId.value)) {
      expandedId.value = list[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(activeProductId, () => {
  editorOpen.value = false
  previewRound.value = 'R1'
  previewDimension.value = 'all'
  void refreshExploreTasks()
})

watch(agentStatus, (status) => {
  if (status === 'done' && agentSkill.value === 'score-and-dedupe') {
    actionMessage.value = '评分去重已完成，可前往线索库查看'
  }
  if (status === 'done' || status === 'error') {
    stopProgressPolling()
    void refreshExploreTasks().then(() => {
      const done = tasks.value.find(
        (t) => t.status === 'completed' || t.status === 'failed',
      )
      const running = tasks.value.find((t) => t.status === 'running')
      if (running) expandedId.value = running.id
      else if (done) expandedId.value = done.id
    })
  }
})

onMounted(() => {
  try {
    localStorage.removeItem('ftcs.explore.maxQueriesLimit')
  } catch {
    // ignore
  }
  void refreshExploreTasks()
  void loadR2Sites()
})

onUnmounted(() => {
  stopProgressPolling()
})
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button
          type="button"
          class="btn-secondary"
          :disabled="!generating"
          @click="stopAgent"
        >
          停止
        </button>
        <ExploreStartControl
          :round="exploreRound"
          :disabled="!canStartSelected"
          :disabled-reason="startDisabledReason"
          :busy="isStartingExplore"
          @update:round="exploreRound = $event"
          @start="startExplore"
        />
      </div>
    </header>

    <div class="explore-summary">
      <span>
        当前产品：{{ activeProduct?.companyName || '未选择' }}
        <template v-if="summary.total"> · {{ summary.total }} 个探索任务</template>
      </span>
      <span class="explore-summary__stats">
        关键词就绪：{{ summary.keywordsReady }} · 运行中：{{ summary.running }} · 已完成：{{
          summary.completed
        }}
      </span>
    </div>

    <p
      v-if="hasKeywordsReady && !canStartSelected && !generating && startDisabledReason"
      class="explore-action-msg"
    >
      {{ startDisabledReason }}
    </p>

    <div class="explore-task-list">
      <div v-if="expandingPlaceholder" class="explore-task is-expanded">
        <button type="button" class="explore-task__head" disabled>
          <div class="explore-task__title-block">
            <div class="explore-task__title-row">
              <strong>关键词扩展</strong>
              <span class="explore-status is-accent">扩展中</span>
            </div>
            <p>正在调用 expand-keywords，完成后将出现在此列表…</p>
          </div>
        </button>
        <div class="explore-task__body">
          <div class="explore-progress">
            <div class="explore-progress__bar is-indeterminate" />
          </div>
        </div>
      </div>

      <div v-if="discoveringPlaceholder" class="explore-task is-expanded">
        <button type="button" class="explore-task__head" disabled>
          <div class="explore-task__title-block">
            <div class="explore-task__title-row">
              <strong>R1 广撒网</strong>
              <span class="explore-status is-accent">启动中</span>
            </div>
            <p>正在调用 discover-leads，创建探索运行记录…</p>
          </div>
        </button>
        <div class="explore-task__body">
          <div class="explore-progress">
            <div class="explore-progress__bar is-indeterminate" />
          </div>
        </div>
      </div>

      <div v-if="discoveringR2Placeholder" class="explore-task is-expanded">
        <button type="button" class="explore-task__head" disabled>
          <div class="explore-task__title-block">
            <div class="explore-task__title-row">
              <strong>R2 社媒发现</strong>
              <span class="explore-status is-accent">启动中</span>
            </div>
            <p>正在调用 discover-leads-r2，创建探索运行记录…</p>
          </div>
        </button>
        <div class="explore-task__body">
          <div class="explore-progress">
            <div class="explore-progress__bar is-indeterminate" />
          </div>
        </div>
      </div>

      <div v-if="discoveringR3Placeholder" class="explore-task is-expanded">
        <button type="button" class="explore-task__head" disabled>
          <div class="explore-task__title-block">
            <div class="explore-task__title-row">
              <strong>R3 地图发现</strong>
              <span class="explore-status is-accent">启动中</span>
            </div>
            <p>正在调用 discover-leads-r3，创建探索运行记录…</p>
          </div>
        </button>
        <div class="explore-task__body">
          <div class="explore-progress">
            <div class="explore-progress__bar is-indeterminate" />
          </div>
        </div>
      </div>

      <div
        v-for="task in tasks"
        :key="task.id"
        class="explore-task"
        :class="{ 'is-expanded': expandedId === task.id }"
      >
        <button type="button" class="explore-task__head" @click="toggleExpand(task.id)">
          <div class="explore-task__title-block">
            <div class="explore-task__title-row">
              <strong>{{ task.title }}</strong>
              <span class="explore-task__id">{{ task.id }}</span>
              <span class="explore-status" :class="`is-${statusTone(task.status)}`">
                {{ statusLabel(task.status) }}
              </span>
            </div>
            <p>{{ task.subtitle }}</p>
          </div>
          <span class="explore-task__chevron">{{ expandedId === task.id ? '▾' : '▸' }}</span>
        </button>

        <div v-if="expandedId === task.id" class="explore-task__body">
          <div class="explore-meta-row">
            <span>关键词 {{ task.totalQueries || '—' }} 条</span>
            <span>轮次 {{ task.rounds.join('+') || 'R1' }}</span>
            <span v-if="task.status === 'running'">
              进度 {{ task.queriesExecuted }}/{{ task.totalQueries || '—' }}
            </span>
            <span v-else-if="task.status === 'completed'">
              线索 {{ task.leadsFound
              }}{{ task.leadsAfterDedupe != null ? ` · 去重 ${task.leadsAfterDedupe}` : '' }}
            </span>
          </div>

          <div
            v-if="task.status === 'keywords_ready' && task.dimensionCounts.length"
            class="explore-dims"
          >
            <span
              v-for="dim in task.dimensionCounts"
              :key="dim.key"
              class="explore-dim-chip"
            >
              {{ dim.label }} {{ dim.count }}
            </span>
          </div>

          <div
            v-if="task.status === 'keywords_ready' && allQueries.length"
            class="explore-preview"
          >
            <div class="explore-preview__head">
              <div class="explore-preview__title">{{ previewTitle }}</div>
              <div class="explore-preview__filters">
                <select v-model="previewRound" class="text-input explore-preview__select">
                  <option
                    v-for="opt in ROUND_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
                <select v-model="previewDimension" class="text-input explore-preview__select">
                  <option
                    v-for="opt in DIMENSION_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <ul v-if="filteredQueries.length" class="explore-preview__list">
              <li v-for="q in filteredQueries" :key="q.id">
                <span class="explore-preview__query">{{ q.query }}</span>
                <span class="explore-preview__meta">
                  {{ queryPreviewMeta(q) }}
                </span>
              </li>
            </ul>
            <p v-else class="explore-preview__empty">{{ previewEmptyText }}</p>
          </div>

          <div v-if="task.status === 'running'" class="explore-progress">
            <div class="explore-progress__bar" :style="{ width: `${progressPct(task)}%` }" />
          </div>

          <div
            v-if="task.status === 'keywords_ready'"
            class="explore-task__actions"
          >
            <button
              type="button"
              class="btn-secondary btn-secondary--sm"
              :disabled="generating"
              @click="openKeywordEditor"
            >
              编辑关键词
            </button>
            <ExploreStartControl
              compact
              :round="exploreRound"
              :disabled="!canStartSelected"
              :disabled-reason="startDisabledReason"
              :busy="isStartingExplore"
              @update:round="exploreRound = $event"
              @start="startExplore"
            />
          </div>

          <div
            v-if="task.status === 'completed' || task.status === 'failed'"
            class="explore-task__actions"
          >
            <button
              type="button"
              class="btn-secondary btn-secondary--sm"
              @click="goLeads(task)"
            >
              查看线索
            </button>
            <button
              v-if="task.status === 'completed' && task.leadsFound > 0"
              type="button"
              class="btn-primary btn-secondary--sm"
              :disabled="generating || isScoring"
              :title="
                generating || isScoring
                  ? '已有任务在运行'
                  : `对 ${task.leadsFound} 条原始线索执行 score-and-dedupe`
              "
              @click="startScoreAndDedupe(task)"
            >
              <Icon name="sparkles" :size="11" />
              {{ isScoring ? '评分中…' : '评分去重' }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!tasks.length && !expandingPlaceholder && !discoveringPlaceholder && !discoveringR2Placeholder"
        class="explore-empty"
      >
        <h2>暂无探索任务</h2>
        <p>请先在「画像」页确认产品就绪，再点击「新建探索任务」扩展关键词。</p>
        <button type="button" class="btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? '刷新中…' : '刷新列表' }}
        </button>
      </div>
    </div>

    <KeywordEditorDialog
      :open="editorOpen"
      :product-id="activeProductId"
      @close="closeKeywordEditor"
      @saved="onKeywordsSaved"
    />
  </section>
</template>
