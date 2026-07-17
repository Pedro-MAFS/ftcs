<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import Icon from '../components/shared/Icon.vue'
import type { ExploreTaskDto } from '../types/electron'

const meta = SECTION_META.explore
const {
  activeProductId,
  activeProduct,
  exploreTasks,
  generating,
  agentSkill,
  agentStatus,
  refreshExploreTasks,
} = useWorkspace()

const expandedId = ref('')
const actionMessage = ref('')
const loading = ref(false)

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

const expandingPlaceholder = computed(() => {
  return (
    generating.value &&
    agentSkill.value === 'expand-keywords' &&
    !tasks.value.some((t) => t.status === 'keywords_ready')
  )
})

const hasKeywordsReady = computed(() =>
  tasks.value.some((t) => t.status === 'keywords_ready'),
)

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
}

function startR1Hint(): void {
  actionMessage.value = 'R1 探索（discover-leads）即将接入，请先确认关键词就绪任务'
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
  void refreshExploreTasks()
})

watch(agentStatus, (status) => {
  if (status === 'done' || status === 'error') {
    void refreshExploreTasks()
  }
})

onMounted(() => {
  void refreshExploreTasks()
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
        <button
          type="button"
          class="btn-primary"
          :disabled="!hasKeywordsReady || generating"
          @click="startR1Hint"
        >
          <Icon name="play" :size="12" />
          开始 R1
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
            v-if="task.status === 'keywords_ready' && task.sampleQueries.length"
            class="explore-preview"
          >
            <div class="explore-preview__title">搜索词预览</div>
            <ul>
              <li v-for="(q, i) in task.sampleQueries" :key="i">{{ q }}</li>
            </ul>
          </div>

          <div v-if="task.status === 'running'" class="explore-progress">
            <div class="explore-progress__bar" :style="{ width: `${progressPct(task)}%` }" />
          </div>

          <div
            v-if="task.status === 'keywords_ready'"
            class="explore-task__actions"
          >
            <button type="button" class="btn-secondary btn-secondary--sm" disabled>
              编辑关键词
            </button>
            <button type="button" class="btn-primary btn-secondary--sm" @click="startR1Hint">
              <Icon name="play" :size="11" />
              开始 R1
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!tasks.length && !expandingPlaceholder"
        class="explore-empty"
      >
        <h2>暂无探索任务</h2>
        <p>请先在「画像」页确认产品就绪，再点击「新建探索任务」扩展关键词。</p>
        <button type="button" class="btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? '刷新中…' : '刷新列表' }}
        </button>
      </div>
    </div>
  </section>
</template>
