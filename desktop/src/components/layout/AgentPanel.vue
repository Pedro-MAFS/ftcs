<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import AgentAwaitingReplyCard from './AgentAwaitingReplyCard.vue'
import AgentPermissionCard from './AgentPermissionCard.vue'
import {
  FREE_DIALOGUE_PLACEHOLDER,
  PERMISSION_PENDING_SEND_HINT,
  composerInputLocked,
  emptyTimelineLabel,
  showDialogueStopButton,
  showTaskAbortButton,
} from '../../composables/free-dialogue'
import { RUNTIME_NOT_READY } from '../../config/user-facing'
import { showToast } from '../../composables/useToast'
import { useWorkspace } from '../../composables/useWorkspace'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'
import {
  createCopySessionController,
  kindLabel,
  skillDisplayName,
  subagentCurrent,
  subagentStatus,
  writeClipboardText,
  type CopySessionSource,
} from './copy-agent-session'

const {
  activeProductId,
  agentSkill,
  agentMeta,
  latestTask,
  agentTimeline,
  agentPrompt,
  agentStatus,
  awaitingUserReply,
  pendingPermission,
  dialogueBusy,
  generating,
  toggleTimelineExpand,
  isTimelineExpanded,
} = useWorkspace()
const { fill, widths, agentCollapsed, toggleAgentCollapsed, enterFill, exitFill } = useWorkspaceLayout()
const collapsedStrip = computed(() => fill.value === 'none' && agentCollapsed.value)
const agentFilled = computed(() => fill.value === 'agent')

const skillLabel = computed(() => skillDisplayName(agentSkill.value))
const copySession = createCopySessionController({
  async readAppVersion() {
    const read = window.ftcs?.getAppVersion
    if (!read) return ''
    return read()
  },
  writeClipboard: writeClipboardText,
  showToast,
  saveTextToDownloads(input) {
    const save = window.ftcs?.saveTextToDownloads
    if (!save) return Promise.resolve({ ok: false as const, error: '保存通道不可用' })
    return save(input)
  },
})
const awaitingCardKey = computed(() => {
  const pending = awaitingUserReply.value
  if (!pending) return 'none'
  if (!pending.renderable) return 'fallback'
  return pending.questions
    .map((question) =>
      [
        question.header,
        question.question,
        question.multiple ? '1' : '0',
        question.custom ? '1' : '0',
        ...question.options.map((option) => option.label),
      ].join('\u0001'),
    )
    .join('\u0002')
})

const timelineEl = ref<HTMLElement | null>(null)
const composerEl = ref<HTMLTextAreaElement | null>(null)
function focusComposer() { void nextTick(() => composerEl.value?.focus()) }
onMounted(() => window.addEventListener('ftcs:focus-agent-composer', focusComposer))
onUnmounted(() => window.removeEventListener('ftcs:focus-agent-composer', focusComposer))
const composerHint = ref('')
const creatingSession = ref(false)
const pinToBottom = ref(true)

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function onCopySession(): void {
  if (copySession.isCopying()) return
  const source: CopySessionSource = {
    items: cloneJson(agentTimeline.value),
    meta: cloneJson(agentMeta.value),
    skill: agentSkill.value,
    status: agentStatus.value,
    awaiting: cloneJson(awaitingUserReply.value),
    productId: activeProductId.value,
    copiedAt: new Date(),
  }
  void copySession.copy(source)
}

async function onCreateSession(): Promise<void> {
  if (creatingSession.value || generating.value || dialogueBusy.value || awaitingUserReply.value || pendingPermission.value) return
  const create = window.ftcs?.createAgentSession
  if (!create) {
    composerHint.value = RUNTIME_NOT_READY
    return
  }
  creatingSession.value = true
  try {
    const result = await create()
    composerHint.value = result.ok ? '' : result.message
  } catch (error) {
    composerHint.value = error instanceof Error ? error.message : '创建会话失败，请重试'
  } finally {
    creatingSession.value = false
  }
}

function stepKey(itemId: string, stepId: string): string {
  return `step:${itemId}:${stepId}`
}

function isStepExpanded(itemId: string, stepId: string): boolean {
  return isTimelineExpanded({
    id: stepKey(itemId, stepId),
    kind: 'tool',
    time: '',
    title: '',
    body: '',
    collapsed: true,
  })
}

function preview(body: string, max = 160): string {
  const text = body.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

async function onSend(): Promise<void> {
  if (pendingPermission.value) {
    composerHint.value = PERMISSION_PENDING_SEND_HINT
    return
  }
  const draft = agentPrompt.value
  const text = draft.trim()
  if (!text || creatingSession.value || composerInputLocked(generating.value, dialogueBusy.value)) return
  const send = window.ftcs?.sendAgentMessage
  if (!send) {
    composerHint.value = RUNTIME_NOT_READY
    return
  }
  composerHint.value = ''
  dialogueBusy.value = true
  agentPrompt.value = ''
  try {
    const result = await send(text, activeProductId.value)
    if (!result.accepted && !agentPrompt.value) agentPrompt.value = draft
    composerHint.value = result.ok ? '' : result.message
  } catch (err) {
    if (!agentPrompt.value) agentPrompt.value = draft
    composerHint.value = err instanceof Error && err.message ? err.message : RUNTIME_NOT_READY
  } finally {
    dialogueBusy.value = false
  }
}

async function onAbort(): Promise<void> {
  await window.ftcs?.abortProfile?.()
}

async function onStopDialogue(): Promise<void> {
  await window.ftcs?.abortProfile?.()
}

function onTimelineScroll(): void {
  const el = timelineEl.value
  if (!el) return
  pinToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

watch(pendingPermission, (pending) => {
  if (!pending && composerHint.value === PERMISSION_PENDING_SEND_HINT) {
    composerHint.value = ''
  }
})

watch(
  agentTimeline,
  async () => {
    await nextTick()
    if (pinToBottom.value && timelineEl.value) {
      timelineEl.value.scrollTop = timelineEl.value.scrollHeight
    }
  },
  { deep: true, flush: 'post' },
)
</script>

<template>
  <aside
    class="agent-panel"
    :class="{ 'is-collapsed': collapsedStrip }"
    :style="{ width: `${widths.agent}px` }"
    aria-label="智能体"
  >
    <button
      v-if="collapsedStrip"
      type="button"
      class="icon-btn"
      title="展开"
      aria-label="展开智能体"
      @click="toggleAgentCollapsed"
    >
      <Icon name="panel-right-open" :size="14" />
    </button>
    <template v-else>
    <div class="agent-panel__head">
      <div class="agent-panel__title">
        <i
          class="agent-panel__pulse"
          :class="{
            on: generating && !awaitingUserReply,
            'is-awaiting': !!awaitingUserReply,
          }"
        />
        <span>智能体</span>
      </div>
      <div class="agent-panel__actions">
        <span class="agent-panel__skill">{{ skillLabel }}</span>
        <button
          type="button"
          class="btn-ghost"
          :disabled="creatingSession || generating || dialogueBusy || !!awaitingUserReply || !!pendingPermission"
          :title="generating || dialogueBusy || awaitingUserReply || pendingPermission ? '请先结束当前任务或回复' : '新建会话'"
          @click="onCreateSession"
        >
          <Icon name="plus" :size="14" />
          新建会话
        </button>
        <button
          type="button"
          class="btn-ghost"
          aria-label="复制当前会话"
          @click="onCopySession"
        >
          复制会话
        </button>
        <button
          v-if="agentFilled"
          type="button"
          class="btn-ghost"
          aria-label="退出占满"
          @click="exitFill"
        >
          <Icon name="minimize-2" :size="14" />
          退出占满
        </button>
        <template v-else>
          <button
            type="button"
            class="icon-btn"
            title="收起"
            aria-label="收起智能体"
            @click="toggleAgentCollapsed"
          >
            <Icon name="panel-right-close" :size="14" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="占满"
            aria-label="智能体占满"
            @click="enterFill('agent')"
          >
            <Icon name="maximize-2" :size="14" />
          </button>
        </template>
      </div>
    </div>

    <div class="agent-panel__meta">
      <div v-for="item in agentMeta" :key="item.label" class="meta-card">
        <span class="meta-card__label">{{ item.label }}</span>
        <span
          class="meta-card__value"
          :class="item.tone ? `tone-${item.tone}` : undefined"
          :title="item.value || undefined"
        >
          {{ item.value }}
        </span>
      </div>
    </div>

    <div
      ref="timelineEl"
      class="agent-panel__timeline"
      @scroll.passive="onTimelineScroll"
    >
      <div
        v-for="item in agentTimeline"
        :key="item.id"
        class="tl-item"
        :class="[
          `tl-item--${item.kind}`,
          item.status ? `is-${item.status}` : '',
          item.subagent ? 'tl-item--subagent' : '',
        ]"
      >
        <div class="tl-item__head">
          <span class="tl-item__badge">{{ item.subagent ? '子代理' : kindLabel(item.kind) }}</span>
          <span class="tl-item__title">{{ item.subagent?.description || item.title }}</span>
          <span class="tl-item__time">{{ item.time }}</span>
        </div>

        <template v-if="item.subagent">
          <p class="tl-subagent__status">{{ subagentStatus(item) }}</p>
          <p class="tl-subagent__current">{{ subagentCurrent(item) }}</p>
          <button
            v-if="item.subagent.steps.length || item.body"
            type="button"
            class="tl-item__toggle"
            @click="toggleTimelineExpand(item.id)"
          >
            {{ isTimelineExpanded(item) ? '收起' : `展开 ${item.subagent.toolCount} 步` }}
          </button>
          <div v-if="isTimelineExpanded(item)" class="tl-subagent__steps">
            <div
              v-for="step in item.subagent.steps"
              :key="step.id"
              class="tl-step"
              :class="step.status ? `is-${step.status}` : ''"
            >
              <div class="tl-step__head">
                <span class="tl-step__title">{{ step.title }}</span>
              </div>
              <template v-if="step.body">
                <pre v-if="isStepExpanded(item.id, step.id)" class="tl-item__body">{{ step.body }}</pre>
                <pre v-else class="tl-item__body tl-item__body--preview">{{ preview(step.body, 80) }}</pre>
                <button
                  type="button"
                  class="tl-item__toggle"
                  @click="toggleTimelineExpand(stepKey(item.id, step.id))"
                >
                  {{ isStepExpanded(item.id, step.id) ? '收起' : '展开' }}
                </button>
              </template>
            </div>
            <pre v-if="item.body" class="tl-item__body tl-subagent__result">{{ item.body }}</pre>
          </div>
        </template>

        <template v-else-if="item.collapsed || item.kind === 'reasoning' || item.kind === 'user'">
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
        {{ emptyTimelineLabel(generating) }}
      </p>
    </div>

    <AgentAwaitingReplyCard
      v-if="awaitingUserReply"
      :key="awaitingCardKey"
      :pending="awaitingUserReply"
    />

    <AgentPermissionCard v-if="pendingPermission" :pending="pendingPermission" />

    <div class="agent-panel__composer">
      <textarea
        ref="composerEl"
        v-model="agentPrompt"
        class="composer-input"
        rows="2"
        :placeholder="FREE_DIALOGUE_PLACEHOLDER"
        :disabled="creatingSession || composerInputLocked(generating, dialogueBusy, !!pendingPermission)"
        @keydown.enter.exact.prevent="onSend"
      />
      <p v-if="composerHint" class="composer-hint" role="status">{{ composerHint }}</p>
      <div class="composer-actions">
        <span class="composer-skill">
          {{ skillLabel }}
          <template v-if="awaitingUserReply"> · 任务在等你回复</template>
          <template v-else-if="latestTask"> · {{ agentMeta[0]?.value }}</template>
        </span>
        <div class="composer-buttons">
          <button
            v-if="showDialogueStopButton(generating, dialogueBusy)"
            type="button"
            class="btn-secondary btn-sm"
            @click="onStopDialogue"
          >
            停止
          </button>
          <button
            v-if="showTaskAbortButton(generating)"
            type="button"
            class="btn-secondary btn-sm"
            @click="onAbort"
          >
            中止
          </button>
          <button
            type="button"
            class="btn-primary btn-sm"
            :disabled="creatingSession || composerInputLocked(generating, dialogueBusy, !!pendingPermission)"
            @click="onSend"
          >
            <Icon name="send" :size="12" />
            发送
          </button>
        </div>
      </div>
    </div>
    </template>
  </aside>
</template>
