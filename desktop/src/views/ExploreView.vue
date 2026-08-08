<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import Icon from '../components/shared/Icon.vue'
import KeywordEditorDialog from '../components/shared/KeywordEditorDialog.vue'
import type { ExploreTaskDto, KeywordExpansionDto } from '../types/electron'

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
  resetAgentForDiscoverLeads,
  resetAgentForScoreAndDedupe,
} = useWorkspace()

const expandedId = ref('')
const actionMessage = ref('')
const loading = ref(false)
const editorOpen = ref(false)
const startingR1 = ref(false)
const scoringLeads = ref(false)
const previewRound = ref('R1')
const previewDimension = ref('all')
/** 最多执行的 R1 词数；null/0 = 不限制，有多少 R1 执行多少 */
const maxQueriesLimit = ref<number | null>(null)
const MAX_QUERIES_STORAGE_KEY = 'ftcs.explore.maxQueriesLimit'

let progressTimer: ReturnType<typeof setInterval> | null = null

const DIMENSION_OPTIONS = [
  { value: 'all', label: '全部维度' },
  { value: 'product', label: '产品' },
  { value: 'scenario', label: '场景' },
  { value: 'buyer', label: '买家' },
  { value: 'geo', label: '地理' },
  { value: 'competitor', label: '竞品' },
]

const ROUND_OPTIONS = [
  { value: 'all', label: '全部轮次' },
  { value: 'R1', label: 'R1' },
  { value: 'R2', label: 'R2' },
  { value: 'R3', label: 'R3' },
  { value: 'R4', label: 'R4' },
]

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

const previewTitle = computed(() => {
  const round =
    previewRound.value === 'all'
      ? '全部轮次'
      : previewRound.value
  const dim =
    previewDimension.value === 'all'
      ? '全部维度'
      : DIM_LABEL[previewDimension.value] || previewDimension.value
  return `搜索词预览 · ${round} · ${dim} · ${filteredQueries.value.length} 条`
})

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

const hasKeywordsReady = computed(() =>
  tasks.value.some((t) => t.status === 'keywords_ready'),
)

const r1QueryCount = computed(
  () => allQueries.value.filter((q) => q.round === 'R1').length,
)

const canStartR1 = computed(() => {
  return (
    !!activeProductId.value &&
    hasKeywordsReady.value &&
    r1QueryCount.value > 0 &&
    !generating.value &&
    !startingR1.value
  )
})

const isDiscovering = computed(
  () => generating.value && agentSkill.value === 'discover-leads',
)

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

/** 默认全部 R1；若填写了正数上限则取 min(上限, R1 数量) */
function resolveMaxQueries(): number {
  const available = Math.max(0, r1QueryCount.value)
  const limit = maxQueriesLimit.value
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return Math.max(1, available)
  }
  return Math.max(1, Math.min(Math.floor(limit), available || Math.floor(limit)))
}

function persistMaxQueriesLimit(): void {
  try {
    if (maxQueriesLimit.value == null || maxQueriesLimit.value <= 0) {
      localStorage.removeItem(MAX_QUERIES_STORAGE_KEY)
    } else {
      localStorage.setItem(MAX_QUERIES_STORAGE_KEY, String(Math.floor(maxQueriesLimit.value)))
    }
  } catch {
    // ignore
  }
}

function onMaxQueriesInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  if (raw.trim() === '') {
    maxQueriesLimit.value = null
  } else {
    const n = Number(raw)
    maxQueriesLimit.value = Number.isFinite(n) ? n : null
  }
  persistMaxQueriesLimit()
}

async function startR1(): Promise<void> {
  if (!activeProductId.value || !window.ftcs?.startExploreR1) return
  if (!canStartR1.value) {
    if (!hasKeywordsReady.value) {
      actionMessage.value = '请先完成关键词扩展'
    } else if (r1QueryCount.value === 0) {
      actionMessage.value = '当前没有 R1 搜索词，请编辑关键词后重试'
    }
    return
  }

  const preflightError = await ensureAgentReady('discover-leads')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  startingR1.value = true
  actionMessage.value = ''
  const maxQueries = resolveMaxQueries()
  resetAgentForDiscoverLeads(maxQueries)
  startProgressPolling()

  try {
    const res = await window.ftcs.startExploreR1({
      productId: activeProductId.value,
      rounds: ['R1'],
      maxQueries,
    })
    if (!res.ok) {
      actionMessage.value = res.message
      agentStatus.value = 'error'
      stopProgressPolling()
      return
    }
    actionMessage.value = res.message
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    agentStatus.value = 'error'
    stopProgressPolling()
  } finally {
    startingR1.value = false
  }
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
    const saved = localStorage.getItem(MAX_QUERIES_STORAGE_KEY)
    if (saved) {
      const n = Number(saved)
      if (Number.isFinite(n) && n > 0) maxQueriesLimit.value = n
    }
  } catch {
    // ignore
  }
  void refreshExploreTasks()
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
        <label class="explore-max-queries" title="留空表示执行全部 R1 关键词">
          <span class="muted">最多词数</span>
          <input
            class="text-input explore-max-queries__input"
            type="number"
            min="1"
            step="1"
            :placeholder="r1QueryCount ? `全部 ${r1QueryCount}` : '全部'"
            :value="maxQueriesLimit ?? ''"
            :disabled="startingR1 || isDiscovering"
            @input="onMaxQueriesInput"
          />
        </label>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!generating"
          @click="stopAgent"
        >
          停止
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canStartR1"
          @click="startR1"
        >
          <Icon name="play" :size="12" />
          {{ startingR1 || isDiscovering ? '探索中…' : '开始 R1' }}
        </button>
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

    <p v-if="actionMessage" class="explore-action-msg">{{ actionMessage }}</p>

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
              <strong>R1 探索</strong>
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
                  {{ DIM_LABEL[q.dimension] || q.dimension }} · {{ q.round }}
                </span>
              </li>
            </ul>
            <p v-else class="explore-preview__empty">当前筛选下无搜索词</p>
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
            <button
              type="button"
              class="btn-primary btn-secondary--sm"
              :disabled="!canStartR1"
              @click="startR1"
            >
              <Icon name="play" :size="11" />
              {{ startingR1 || isDiscovering ? '探索中…' : '开始 R1' }}
            </button>
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
              @click="startScoreAndDedupe(task)"
            >
              <Icon name="sparkles" :size="11" />
              {{ isScoring ? '评分中…' : '评分去重' }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!tasks.length && !expandingPlaceholder && !discoveringPlaceholder"
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
