import type { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { readUserPrefs } from '../config/user-prefs'
import {
  TASK_DONE_NOTIFY_TITLE,
  isWorkflowNotifySuppressed,
  resolveTaskDoneNotificationEnabled,
  shouldShowTaskDoneNotification,
  truncateTaskDoneNotifyBody,
} from './task-done-notify-logic'

export {
  TASK_DONE_NOTIFY_TITLE,
  TASK_DONE_NOTIFY_BODY_MAX,
  resolveTaskDoneNotificationEnabled,
  shouldShowTaskDoneNotification,
  truncateTaskDoneNotifyBody,
  setWorkflowNotifySuppressed,
  isWorkflowNotifySuppressed,
  resetWorkflowNotifySuppressedForTests,
} from './task-done-notify-logic'

export type TaskDoneNotifyInput = {
  /** 通知正文（已由调用方写好摘要） */
  body: string
  /** 成功 / 失败；本期不改写 body，供调用方与日后扩展 */
  ok: boolean
}

type MainWindowGetter = () => BrowserWindow | null

const requireElectron = createRequire(import.meta.url)

let getMainWindow: MainWindowGetter = () => null

function loadElectronNotification(): typeof import('electron').Notification | null {
  try {
    const electron = requireElectron('electron') as typeof import('electron')
    return electron.Notification ?? null
  } catch {
    return null
  }
}

export function setTaskDoneNotifyMainWindowGetter(getter: MainWindowGetter): void {
  getMainWindow = getter
}

export function isTaskDoneNotificationEnabled(): boolean {
  return resolveTaskDoneNotificationEnabled(readUserPrefs().taskDoneNotificationEnabled)
}

export function focusMainWindowFromNotification(): void {
  const win = getMainWindow()
  if (!win) return
  try {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } catch {
    // 静默
  }
}

/**
 * 尝试弹出系统通知。任何失败吞掉。
 * @returns true 表示已调用 Notification.show；false 表示被闸门跳过或失败
 */
export function showTaskDoneNotification(input: TaskDoneNotifyInput): boolean {
  const body = truncateTaskDoneNotifyBody(input.body ?? '')
  if (!body) return false

  const win = getMainWindow()
  const windowState = win
    ? { isFocused: win.isFocused(), isMinimized: win.isMinimized() }
    : null

  const NotificationCtor = loadElectronNotification()
  let supported = false
  try {
    supported = Boolean(NotificationCtor?.isSupported?.())
  } catch {
    supported = false
  }

  const allow = shouldShowTaskDoneNotification({
    enabled: isTaskDoneNotificationEnabled(),
    suppressed: isWorkflowNotifySuppressed(),
    supported,
    window: windowState,
  })
  if (!allow || !NotificationCtor) return false

  try {
    const notification = new NotificationCtor({
      title: TASK_DONE_NOTIFY_TITLE,
      body,
      silent: false,
    })
    notification.on('click', () => {
      focusMainWindowFromNotification()
    })
    notification.show()
    return true
  } catch {
    return false
  }
}

/** 单测用：重置主窗口 getter */
export function resetTaskDoneNotifyForTests(): void {
  getMainWindow = () => null
}
