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
import type { ChatReferenceView } from '../../types/electron'
import { filterMentionCandidates, findMentionQuery, listMentionCandidates, replaceMentionQuery, type MentionCandidate, type MentionQuery } from './composer-references'
import {
  createCopySessionController,
  kindLabel,
  subagentCurrent,
  subagentStatus,
  writeClipboardText,
  type CopySessionSource,
} from './copy-agent-session'

const {
  activeProductId,
  agentSkill,
  agentMeta,
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
const references = ref<ChatReferenceView[]>([])
const selectingReference = ref(false)
const mentionQuery = ref<MentionQuery | null>(null)
const mentionCandidates = ref<MentionCandidate[]>([])
const mentionLoading = ref(false)
const mentionTruncated = ref(false)
const mentionIndex = ref(0)
const visibleMentions = computed(() => filterMentionCandidates(mentionCandidates.value, mentionQuery.value?.query || ''))
let mentionRequest = 0
const pinToBottom = ref(true)

async function pickReferences() {
  if (selectingReference.value || !window.ftcs?.pickAgentReferences) return
  selectingReference.value = true; composerHint.value = ''
  try { references.value.push(...await window.ftcs.pickAgentReferences()) }
  catch (error) { composerHint.value = error instanceof Error ? error.message : '无法选择文件，请重试。' }
  finally { selectingReference.value = false; focusComposer() }
}
function removeReference(id: string) {
  references.value = references.value.filter(item => item.id !== id)
  void window.ftcs?.discardAgentReferences?.([id])
}
async function loadMentions() {
  const request = ++mentionRequest
  if (!window.ftcs?.listLibrary || !window.ftcs?.listProfiles) return
  mentionCandidates.value = []
  mentionTruncated.value = false
  mentionLoading.value = true
  try {
    const [library, profiles] = await Promise.all([window.ftcs.listLibrary(), window.ftcs.listProfiles()])
    if (request !== mentionRequest) return
    mentionCandidates.value = listMentionCandidates(library.tree, profiles)
    mentionTruncated.value = library.truncated
  } catch { if (request === mentionRequest) composerHint.value = '无法读取资料库或产品画像，请重试。' }
  finally { if (request === mentionRequest) mentionLoading.value = false }
}
function updateMention(event: Event) {
  const input = event.target as HTMLTextAreaElement
  const next = findMentionQuery(input.value, input.selectionStart)
  if (next && !mentionQuery.value) void loadMentions()
  mentionQuery.value = next
  mentionIndex.value = 0
}
async function chooseMention(candidate: MentionCandidate) {
  const query = mentionQuery.value
  if (!query || selectingReference.value || !window.ftcs?.addAgentReference) return
  selectingReference.value = true; composerHint.value = ''
  try {
    const selected = await window.ftcs.addAgentReference({ kind: candidate.kind, value: candidate.value })
    references.value.push(selected)
    agentPrompt.value = replaceMentionQuery(agentPrompt.value, query)
    mentionQuery.value = null
    await nextTick()
    composerEl.value?.setSelectionRange(query.start, query.start)
  } catch (error) { composerHint.value = error instanceof Error ? error.message : '无法添加资料，请重试。' }
  finally { selectingReference.value = false; focusComposer() }
}
function onComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (mentionQuery.value) {
    if (event.key === 'Escape') { event.preventDefault(); mentionQuery.value = null; return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const count = visibleMentions.value.length
      if (count) mentionIndex.value = (mentionIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
      return
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && visibleMentions.value.length) {
      event.preventDefault(); void chooseMention(visibleMentions.value[mentionIndex.value] || visibleMentions.value[0]); return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); void onSend() }
}

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
  if (creatingSession.value || selectingReference.value || generating.value || dialogueBusy.value || awaitingUserReply.value || pendingPermission.value) return
  const create = window.ftcs?.createAgentSession
  if (!create) {
    composerHint.value = RUNTIME_NOT_READY
    return
  }
  creatingSession.value = true
  try {
    const result = await create()
    if (result.ok) { void window.ftcs?.discardAgentReferences?.(references.value.map(item => item.id)); references.value = []; mentionQuery.value = null }
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
  if ((!text && !references.value.length) || creatingSession.value || selectingReference.value || composerInputLocked(generating.value, dialogueBusy.value)) return
  if (references.value.length > 100) { composerHint.value = '一次最多发送 100 项参考资料，请移除一部分后重试。'; return }
  const send = window.ftcs?.sendAgentMessage
  if (!send) {
    composerHint.value = RUNTIME_NOT_READY
    return
  }
  composerHint.value = ''
  dialogueBusy.value = true
  const attached = references.value
  references.value = []
  mentionQuery.value = null
  agentPrompt.value = ''
  try {
    const result = await send(text, activeProductId.value, attached.map(item => item.id))
    if (!result.accepted) { if (!agentPrompt.value) agentPrompt.value = draft; references.value = [...attached, ...references.value] }
    composerHint.value = result.ok ? '' : result.message
  } catch (err) {
    if (!agentPrompt.value) agentPrompt.value = draft
    references.value = [...attached, ...references.value]
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
      <div v-if="mentionQuery" class="mention-list" role="listbox" aria-label="引用资料">
        <p v-if="mentionLoading" class="mention-message">正在读取资料…</p>
        <p v-else-if="!visibleMentions.length" class="mention-message">没有找到匹配的资料。</p>
        <button v-for="(item, index) in visibleMentions" :key="`${item.kind}:${item.value}`" class="mention-option" :class="{ 'is-active': index === mentionIndex }" type="button" role="option" :aria-selected="index === mentionIndex" :disabled="selectingReference" @mousedown.prevent @click="chooseMention(item)">
          <span>{{ item.kind === 'profile' ? '画像' : item.kind === 'website' ? '网站' : '资料' }} · {{ item.label }}</span><small>{{ item.detail }}</small>
        </button>
        <p v-if="mentionTruncated" class="mention-message">资料库结果未完整显示，可通过附件选择文件。</p>
      </div>
      <div v-if="references.length" class="composer-references" aria-label="待发送的参考资料">
        <span v-for="item in references" :key="item.id" class="composer-reference" :title="item.detail">
          <span>{{ item.kind === 'local' ? '附件' : '@' }} {{ item.label }}</span>
          <button type="button" :aria-label="`移除 ${item.label}`" @click="removeReference(item.id)">×</button>
        </span>
      </div>
      <textarea
        ref="composerEl"
        v-model="agentPrompt"
        class="composer-input"
        rows="2"
        :placeholder="FREE_DIALOGUE_PLACEHOLDER"
        :disabled="creatingSession || selectingReference || composerInputLocked(generating, dialogueBusy, !!pendingPermission)"
        @input="updateMention"
        @click="updateMention"
        @keydown="onComposerKeydown"
      />
      <p v-if="composerHint" class="composer-hint" role="status">{{ composerHint }}</p>
      <div class="composer-actions">
        <span v-if="awaitingUserReply" class="composer-skill">任务在等你回复</span>
        <div class="composer-buttons">
          <button type="button" class="btn-secondary btn-sm" title="选择本地文件作为参考" aria-label="选择本地文件" :disabled="creatingSession || selectingReference || composerInputLocked(generating, dialogueBusy, !!pendingPermission)" @click="pickReferences">
            附件
          </button>
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
            :disabled="creatingSession || selectingReference || composerInputLocked(generating, dialogueBusy, !!pendingPermission)"
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

<style scoped>
.agent-panel__composer { position: relative; }
.composer-references { display: flex; flex-wrap: wrap; gap: 6px; max-height: 90px; overflow: auto; }
.composer-reference { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 7px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-elevated); color: var(--text); font-size: 11px; }
.composer-reference span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-reference button { border: 0; padding: 0 2px; color: var(--text-secondary); background: none; cursor: pointer; font-size: 15px; }
.mention-list { position: absolute; left: 14px; right: 14px; bottom: calc(100% - 1px); z-index: 4; display: grid; gap: 2px; max-height: 240px; overflow-y: auto; padding: 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-panel); box-shadow: 0 6px 18px #0002; }
.mention-option { display: grid; gap: 3px; width: 100%; padding: 7px 9px; border: 0; border-radius: 4px; text-align: left; background: none; color: var(--text); cursor: pointer; font-size: 12px; }
.mention-option.is-active, .mention-option:hover { background: var(--bg-hover); }
.mention-option small { overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary); }
.mention-message { margin: 0; padding: 8px; color: var(--text-secondary); font-size: 11px; }
</style>
