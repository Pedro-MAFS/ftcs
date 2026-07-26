import { computed, onMounted, ref, watch } from 'vue'
import { authLoggedIn } from './useAuth'
import type {
  InboxAnswer,
  InboxDraftAnswer,
  InboxMessage,
} from '../types/inbox'

const DEFAULT_POLL_MS = 60 * 60 * 1000
const LOG = '[ftcs:inbox]'

function log(...args: unknown[]): void {
  console.log(LOG, ...args)
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG, ...args)
}

const items = ref<InboxMessage[]>([])
const currentIndex = ref(0)
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const pollIntervalMs = ref(DEFAULT_POLL_MS)
/** messageId -> questionId -> draft */
const drafts = ref<Record<string, Record<string, InboxDraftAnswer>>>({})

let timer: ReturnType<typeof setInterval> | null = null
let started = false
let focusHandler: (() => void) | null = null

const unreadCount = computed(() => items.value.length)
const badgeLabel = computed(() => {
  const n = unreadCount.value
  if (n <= 0) return ''
  return n > 9 ? '9+' : String(n)
})
const currentMessage = computed(() => items.value[currentIndex.value] ?? null)
const positionLabel = computed(() => {
  const total = items.value.length
  if (total <= 0) return ''
  return `${currentIndex.value + 1}/${total}`
})

function ensureDraft(messageId: string, questionId: string): InboxDraftAnswer {
  if (!drafts.value[messageId]) drafts.value[messageId] = {}
  if (!drafts.value[messageId][questionId]) {
    drafts.value[messageId][questionId] = {}
  }
  return drafts.value[messageId][questionId]
}

function setSingleAnswer(messageId: string, questionId: string, index: number): void {
  const d = ensureDraft(messageId, questionId)
  d.optionIndexes = [index]
  drafts.value = { ...drafts.value }
}

function toggleMultiAnswer(
  messageId: string,
  questionId: string,
  index: number,
): void {
  const d = ensureDraft(messageId, questionId)
  const set = new Set(d.optionIndexes ?? [])
  if (set.has(index)) set.delete(index)
  else set.add(index)
  d.optionIndexes = [...set].sort((a, b) => a - b)
  drafts.value = { ...drafts.value }
}

function setTextAnswer(messageId: string, questionId: string, text: string): void {
  const d = ensureDraft(messageId, questionId)
  d.text = text
  drafts.value = { ...drafts.value }
}

function getDraft(messageId: string, questionId: string): InboxDraftAnswer {
  return drafts.value[messageId]?.[questionId] ?? {}
}

/** 收集已填写的答案；未填的题目跳过（不强制作答） */
function collectAnswers(msg: InboxMessage): InboxAnswer[] {
  const answers: InboxAnswer[] = []
  for (const block of msg.blocks) {
    if (block.type === 'TEXT') continue
    const draft = getDraft(msg.messageId, block.id)
    if (block.type === 'SINGLE') {
      const idx = draft.optionIndexes?.[0]
      if (idx == null || idx < 0 || idx >= block.options.length) continue
      answers.push({ questionId: block.id, optionIndexes: [idx] })
      continue
    }
    if (block.type === 'MULTI') {
      const idxs = (draft.optionIndexes ?? []).filter(
        (i) => i >= 0 && i < block.options.length,
      )
      if (idxs.length === 0) continue
      answers.push({ questionId: block.id, optionIndexes: idxs })
      continue
    }
    if (block.type === 'TEXT_REPLY') {
      const text = (draft.text ?? '').trim()
      if (!text) continue
      if (block.maxLength != null && text.length > block.maxLength) continue
      answers.push({ questionId: block.id, text })
    }
  }
  return answers
}

function removeCurrentLocally(): void {
  const msg = currentMessage.value
  if (!msg) return
  const next = items.value.filter((m) => m.messageId !== msg.messageId)
  const oldIndex = currentIndex.value
  items.value = next
  delete drafts.value[msg.messageId]
  drafts.value = { ...drafts.value }
  if (next.length === 0) {
    currentIndex.value = 0
    visible.value = false
  } else {
    currentIndex.value = Math.min(oldIndex, next.length - 1)
    visible.value = true
  }
}

function pruneDrafts(nextItems: InboxMessage[]): void {
  const keep = new Set(nextItems.map((m) => m.messageId))
  const next: typeof drafts.value = {}
  for (const [id, d] of Object.entries(drafts.value)) {
    if (keep.has(id)) next[id] = d
  }
  drafts.value = next
}

/**
 * 按 messageId 合并拉取结果：
 * - 仍在服务端未读列表中的本地项：保留（不重置草稿/当前位置）
 * - 服务端已无（已 ack/过期）：从本地移除
 * - 本地没有的 id：追加到末尾
 * 定时轮询时仅当有「新 id」才自动弹层（openIfNew）。
 */
function applyItems(
  next: InboxMessage[],
  opts: { openIfNew?: boolean; forceOpen?: boolean },
): void {
  const prevId = currentMessage.value?.messageId
  const existingIds = new Set(items.value.map((m) => m.messageId))
  const serverIds = new Set(next.map((m) => m.messageId))

  // 服务端同次响应内也可能重复，先按 id 去重（保留首次）
  const serverUnique: InboxMessage[] = []
  const seenServer = new Set<string>()
  for (const m of next) {
    if (seenServer.has(m.messageId)) continue
    seenServer.add(m.messageId)
    serverUnique.push(m)
  }

  const kept = items.value.filter((m) => serverIds.has(m.messageId))
  const appended = serverUnique.filter((m) => !existingIds.has(m.messageId))
  const merged = [...kept, ...appended]
  const hadNew = appended.length > 0

  items.value = merged
  pruneDrafts(merged)

  if (merged.length === 0) {
    currentIndex.value = 0
    visible.value = false
    log('applyItems empty → hide toast')
    return
  }

  if (prevId) {
    const idx = merged.findIndex((m) => m.messageId === prevId)
    currentIndex.value = idx >= 0 ? idx : Math.min(currentIndex.value, merged.length - 1)
  } else {
    currentIndex.value = 0
  }

  const shouldOpen =
    opts.forceOpen || (opts.openIfNew && hadNew) || visible.value
  if (shouldOpen) {
    visible.value = true
  }
  log('applyItems', {
    kept: kept.length,
    appended: appended.length,
    merged: merged.length,
    hadNew,
    forceOpen: opts.forceOpen,
    openIfNew: opts.openIfNew,
    shouldOpen,
    visible: visible.value,
    currentIndex: currentIndex.value,
    appendedIds: appended.map((m) => m.messageId),
    ids: merged.map((m) => m.messageId),
  })
}

async function loadConfig(): Promise<void> {
  if (!window.ftcs?.getInboxConfig) {
    logWarn('getInboxConfig API missing on window.ftcs')
    return
  }
  try {
    const cfg = await window.ftcs.getInboxConfig()
    if (cfg?.pollIntervalMs && cfg.pollIntervalMs > 0) {
      pollIntervalMs.value = cfg.pollIntervalMs
    }
    log('renderer config', cfg)
  } catch (err) {
    logWarn('loadConfig failed', err)
  }
}

async function pull(opts?: {
  openIfNew?: boolean
  forceOpen?: boolean
}): Promise<void> {
  if (!window.ftcs?.pullInbox) {
    logWarn('pullInbox API missing on window.ftcs')
    return
  }
  log('renderer pull', opts, { loggedIn: authLoggedIn.value })
  busy.value = true
  try {
    const res = await window.ftcs.pullInbox(20)
    log('renderer pull response', {
      ok: res.ok,
      needLogin: res.needLogin,
      message: res.message,
      count: res.items?.length ?? 0,
    })
    if (res.needLogin) {
      clearInboxState()
      error.value = ''
      return
    }
    if (!res.ok) {
      error.value = res.message || '拉取站内信失败'
      logWarn('pull not ok', res.message)
      return
    }
    error.value = ''
    applyItems(res.items ?? [], {
      openIfNew: opts?.openIfNew ?? false,
      forceOpen: opts?.forceOpen ?? false,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    logWarn('pull exception', error.value)
  } finally {
    busy.value = false
  }
}

/**
 * 确认当前信为已读并 ack。
 * 不强制作答：有填则带上，没有则 answers=[]。
 * 关闭 /「知道了」走此路径；「稍后」不要调用。
 */
async function ackCurrent(): Promise<{ ok: boolean; message: string }> {
  const msg = currentMessage.value
  if (!msg || !window.ftcs?.ackInbox) {
    return { ok: false, message: '无消息可确认' }
  }

  const answers = collectAnswers(msg)
  log('ackCurrent', { messageId: msg.messageId, answersCount: answers.length })
  busy.value = true
  error.value = ''
  try {
    const res = await window.ftcs.ackInbox({
      messageId: msg.messageId,
      answers,
    })
    if (res.needLogin) {
      clearInboxState()
      return { ok: false, message: res.message }
    }
    if (!res.ok) {
      // 仍按已读移除本地，避免关闭按钮卡死；服务端错误记入日志与提示
      logWarn('ack failed, remove locally anyway', res.message)
      error.value = res.message
      removeCurrentLocally()
      return { ok: true, message: res.message || '已关闭' }
    }

    removeCurrentLocally()
    return { ok: true, message: '已确认' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logWarn('ack exception, remove locally anyway', message)
    error.value = message
    removeCurrentLocally()
    return { ok: true, message }
  } finally {
    busy.value = false
  }
}

function clearInboxState(): void {
  items.value = []
  currentIndex.value = 0
  visible.value = false
  drafts.value = {}
  error.value = ''
}

function openPanel(): void {
  log('openPanel', { count: items.value.length })
  if (items.value.length === 0) {
    void pull({ forceOpen: true })
    return
  }
  visible.value = true
}

/** 稍后：仅隐藏，不 ack */
function dismissPanel(): void {
  log('dismissPanel (稍后，不 ack)')
  visible.value = false
}

function goPrev(): void {
  if (currentIndex.value > 0) currentIndex.value -= 1
}

function goNext(): void {
  if (currentIndex.value < items.value.length - 1) currentIndex.value += 1
}

function stopPolling(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startPolling(): void {
  stopPolling()
  log('startPolling', { pollIntervalMs: pollIntervalMs.value })
  timer = setInterval(() => {
    log('poll tick')
    void pull({ openIfNew: true, forceOpen: false })
  }, pollIntervalMs.value)
}

async function bootstrap(): Promise<void> {
  if (started) {
    log('bootstrap skipped (already started)')
    return
  }
  started = true
  log('bootstrap begin', { authLoggedIn: authLoggedIn.value })
  await loadConfig()

  focusHandler = () => {
    log('window focus', { authLoggedIn: authLoggedIn.value })
    if (authLoggedIn.value) void pull({ forceOpen: true })
  }
  window.addEventListener('focus', focusHandler)

  watch(
    authLoggedIn,
    (on) => {
      log('authLoggedIn changed', on)
      if (on) {
        void pull({ forceOpen: true })
        startPolling()
      } else {
        stopPolling()
        clearInboxState()
      }
    },
    { immediate: true },
  )
}

export function useInbox() {
  onMounted(() => {
    void bootstrap()
  })

  return {
    items,
    currentIndex,
    currentMessage,
    visible,
    busy,
    error,
    unreadCount,
    badgeLabel,
    positionLabel,
    pollIntervalMs,
    getDraft,
    setSingleAnswer,
    toggleMultiAnswer,
    setTextAnswer,
    pull,
    ackCurrent,
    openPanel,
    dismissPanel,
    goPrev,
    goNext,
  }
}

/** 供 AuthMenu 等在未挂载 Toast 时也能触发打开 */
export function openInboxPanel(): void {
  void bootstrap().then(() => openPanel())
}
