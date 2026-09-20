export const TASK_DONE_NOTIFY_TITLE = 'FTCS·外贸获客智能体'
export const TASK_DONE_NOTIFY_BODY_MAX = 180

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
