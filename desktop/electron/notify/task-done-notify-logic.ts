export const TASK_DONE_NOTIFY_TITLE = 'FTCS·外贸获客智能体'
export const TASK_DONE_NOTIFY_BODY_MAX = 180
export const AWAITING_REPLY_NOTIFY_BODY = '任务在等你回复'

let workflowNotifySuppressed = false

/** 读 prefs：缺省 / 非法 → true */
export function resolveTaskDoneNotificationEnabled(raw: unknown): boolean {
  if (raw === false) return false
  return true
}

export function setWorkflowNotifySuppressed(suppressed: boolean): void {
  workflowNotifySuppressed = suppressed
}

export function isWorkflowNotifySuppressed(): boolean {
  return workflowNotifySuppressed
}

/** 单测用：重置抑制闸门 */
export function resetWorkflowNotifySuppressedForTests(): void {
  workflowNotifySuppressed = false
}

export function truncateTaskDoneNotifyBody(raw: string): string {
  const value = raw.trim()
  const chars = [...value]
  if (chars.length <= TASK_DONE_NOTIFY_BODY_MAX) return value
  return `${chars.slice(0, TASK_DONE_NOTIFY_BODY_MAX).join('')}…`
}

/**
 * 是否「允许展示」的纯判定：
 * enabled && !suppressed && supported && windowExists && (!focused || minimized)
 */
export function shouldShowTaskDoneNotification(opts: {
  enabled: boolean
  suppressed: boolean
  supported: boolean
  window: { isFocused: boolean; isMinimized: boolean } | null
}): boolean {
  if (!opts.enabled) return false
  if (opts.suppressed) return false
  if (!opts.supported) return false
  if (!opts.window) return false
  if (opts.window.isFocused && !opts.window.isMinimized) return false
  return true
}

/**
 * 等待回复通知：窗口条件与任务完成通知相同，但忽略编排抑制。
 * suppressed 参数保留是为了调用方把现网闸门原样传进来，这里固定不看它。
 */
export function shouldShowAwaitingReplyNotification(opts: {
  enabled: boolean
  suppressed: boolean
  supported: boolean
  window: { isFocused: boolean; isMinimized: boolean } | null
}): boolean {
  return shouldShowTaskDoneNotification({
    enabled: opts.enabled,
    suppressed: false,
    supported: opts.supported,
    window: opts.window,
  })
}
