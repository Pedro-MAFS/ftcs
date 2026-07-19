<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import type { AgentTimelineItem } from '../../types/workspace'

const {
  agentSkill,
  agentMeta,
  agentTimeline,
  agentPrompt,
  agentStatus,
  generating,
  toggleTimelineExpand,
  isTimelineExpanded,
} = useWorkspace()

const timelineEl = ref<HTMLElement | null>(null)
const composerHint = ref('')

function kindLabel(kind: AgentTimelineItem['kind']): string {
  switch (kind) {
    case 'user':
      return '你'
    case 'system':
      return '系统'
    case 'assistant':
      return '回复'
    case 'reasoning':
      return '思考'
    case 'tool':
      return '工具'
    case 'error':
      return '错误'
    default:
      return kind
  }
}

function preview(body: string, max = 160): string {
  const text = body.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

async function onSend(): Promise<void> {
  composerHint.value =
    '当前暂不支持在对话区自由发送指令，请通过左侧流水线按钮启动对应 Agent 任务。'
}

async function onAbort(): Promise<void> {
  await window.ftcs?.abortProfile?.()
}

watch(
  agentTimeline,
  async () => {
    await nextTick()
    if (timelineEl.value) {
      timelineEl.value.scrollTop = timelineEl.value.scrollHeight
    }
  },
  { deep: true, flush: 'post' },
)
</script>

<template>
  <aside class="agent-panel" aria-label="Agent">
    <div class="agent-panel__head">
      <div class="agent-panel__title">
        <i class="agent-panel__pulse" :class="{ on: generating }" />
        <span>Agent</span>
      </div>
      <span class="agent-panel__skill">{{ agentSkill }}</span>
    </div>

    <div class="agent-panel__meta">
      <div v-for="item in agentMeta" :key="item.label" class="meta-card">
        <span class="meta-card__label">{{ item.label }}</span>
        <span class="meta-card__value" :class="item.tone ? `tone-${item.tone}` : undefined">
          {{ item.value }}
        </span>
      </div>
    </div>

    <div ref="timelineEl" class="agent-panel__timeline">
      <div
        v-for="item in agentTimeline"
        :key="item.id"
        class="tl-item"
        :class="[`tl-item--${item.kind}`, item.status ? `is-${item.status}` : '']"
      >
        <div class="tl-item__head">
          <span class="tl-item__badge">{{ kindLabel(item.kind) }}</span>
          <span class="tl-item__title">{{ item.title }}</span>
          <span class="tl-item__time">{{ item.time }}</span>
        </div>

        <template v-if="item.collapsed || item.kind === 'reasoning' || item.kind === 'user'">
          <pre v-if="isTimelineExpanded(item)" class="tl-item__body">{{ item.body }}</pre>
          <pre v-else class="tl-item__body tl-item__body--preview">{{ preview(item.body) }}</pre>
          <button
            type="button"
            class="tl-item__toggle"
            @click="toggleTimelineExpand(item.id)"
          >
            {{ isTimelineExpanded(item) ? '收起' : '展开全文' }}
          </button>
        </template>
        <pre v-else class="tl-item__body">{{ item.body }}</pre>
      </div>

      <p v-if="!agentTimeline.length" class="agent-panel__empty">
        {{ generating ? '任务启动中…' : '点击「生成画像」后，此处按时间顺序展示指令、思考、工具与回复' }}
      </p>
    </div>

    <div class="agent-panel__composer">
      <textarea
        v-model="agentPrompt"
        class="composer-input"
        rows="2"
        placeholder="自由对话暂未开放，请用左侧流水线启动任务…"
        :disabled="generating"
        @keydown.enter.exact.prevent="onSend"
      />
      <p v-if="composerHint" class="composer-hint" role="status">{{ composerHint }}</p>
      <div class="composer-actions">
        <span class="composer-skill">
          Skill · {{ agentSkill }}
          <template v-if="agentStatus !== 'idle'"> · {{ agentStatus }}</template>
        </span>
        <button
          v-if="generating"
          type="button"
          class="btn-secondary btn-sm"
          @click="onAbort"
        >
          中止
        </button>
        <button type="button" class="btn-primary btn-sm" :disabled="generating" @click="onSend">
          <Icon name="send" :size="12" />
          发送
        </button>
      </div>
    </div>
  </aside>
</template>
