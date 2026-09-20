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
type ElectronNotification = InstanceType<typeof import('electron').Notification>

const LOG = '[ftcs:notify]'
const requireElectron = createRequire(import.meta.url)

let getMainWindow: MainWindowGetter = () => null
let notifySeq = 0

/**
 * Electron 要求保留 Notification 强引用，否则会被 GC，click 永远不触发。
 * @see https://www.electronjs.org/docs/latest/api/notification
 */
const activeNotifications: ElectronNotification[] = []

function log(...args: unknown[]): void {
  console.log(LOG, ...args)
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG, ...args)
}

function describeWindow(win: BrowserWindow | null): Record<string, unknown> {
  if (!win) return { exists: false }
  try {
    return {
      exists: true,
      destroyed: win.isDestroyed(),
      focused: win.isFocused(),
      minimized: win.isMinimized(),
      visible: win.isVisible(),
      alwaysOnTop: win.isAlwaysOnTop(),
    }
  } catch (err) {
    return { exists: true, describeError: String(err) }
  }
}

function loadElectron(): typeof import('electron') | null {
  try {
    return requireElectron('electron') as typeof import('electron')
  } catch {
    return null
  }
}

function loadElectronNotification(): typeof import('electron').Notification | null {
  return loadElectron()?.Notification ?? null
}

function retainNotification(notification: ElectronNotification, id: number): void {
  activeNotifications.push(notification)
  const release = (reason: string): void => {
    const idx = activeNotifications.indexOf(notification)
    if (idx >= 0) activeNotifications.splice(idx, 1)
    log('release', { id, reason, remaining: activeNotifications.length })
  }
  notification.once('close', () => release('close'))
  notification.once('failed', () => release('failed'))
}

export function setTaskDoneNotifyMainWindowGetter(getter: MainWindowGetter): void {
  getMainWindow = getter
}

export function isTaskDoneNotificationEnabled(): boolean {
  return resolveTaskDoneNotificationEnabled(readUserPrefs().taskDoneNotificationEnabled)
}

export function focusMainWindowFromNotification(source = 'click'): void {
  const win = getMainWindow()
  log('focus:start', { source, window: describeWindow(win) })
  if (!win) {
    logWarn('focus:abort no main window')
    return
  }
  try {
    // Windows 常需先让 app 抢前台权限，否则只闪任务栏
    try {
      loadElectron()?.app?.focus?.()
      log('focus:app.focus ok')
    } catch (err) {
      logWarn('focus:app.focus failed', err)
    }
    if (win.isMinimized()) {
      win.restore()
      log('focus:restore', describeWindow(win))
    }
    win.show()
    win.moveTop()
    // 短暂置顶绕过 AllowSetForegroundWindow 限制（Windows）
    win.setAlwaysOnTop(true)
    win.focus()
    win.setAlwaysOnTop(false)
    win.focus()
    log('focus:done', describeWindow(win))
  } catch (err) {
    logWarn('focus:error', err)
  }
}

/**
 * 尝试弹出系统通知。任何失败吞掉。
 * @returns true 表示已调用 Notification.show；false 表示被闸门跳过或失败
 */
export function showTaskDoneNotification(input: TaskDoneNotifyInput): boolean {
  const id = ++notifySeq
  const body = truncateTaskDoneNotifyBody(input.body ?? '')
  if (!body) {
    log('show:skip empty body', { id })
    return false
  }

  const win = getMainWindow()
  const windowState = win
    ? { isFocused: win.isFocused(), isMinimized: win.isMinimized() }
    : null

  const electron = loadElectron()
  const NotificationCtor = electron?.Notification ?? null
  let supported = false
  try {
    supported = Boolean(NotificationCtor?.isSupported?.())
  } catch {
    supported = false
  }

  const enabled = isTaskDoneNotificationEnabled()
  const suppressed = isWorkflowNotifySuppressed()
  const allow = shouldShowTaskDoneNotification({
    enabled,
    suppressed,
    supported,
    window: windowState,
  })

  log('show:gate', {
    id,
    ok: input.ok,
    bodyPreview: body.slice(0, 80),
    allow,
    enabled,
    suppressed,
    supported,
    window: windowState,
    platform: process.platform,
    packaged: electron?.app?.isPackaged,
    execPath: process.execPath,
    activeCount: activeNotifications.length,
  })

  if (!allow || !NotificationCtor) {
    log('show:skipped', { id, allow, hasCtor: Boolean(NotificationCtor) })
    return false
  }

  try {
    const notification = new NotificationCtor({
      title: TASK_DONE_NOTIFY_TITLE,
      body,
      silent: false,
    })
    retainNotification(notification, id)
    notification.on('show', () => {
      log('event:show', { id })
    })
    notification.on('click', () => {
      log('event:click', { id, window: describeWindow(getMainWindow()) })
      focusMainWindowFromNotification('notification-click')
    })
    notification.on('close', () => {
      log('event:close', { id })
    })
    notification.on('failed', (...args: unknown[]) => {
      logWarn('event:failed', { id, args })
    })
    notification.show()
    log('show:called', { id, retained: activeNotifications.length })
    return true
  } catch (err) {
    logWarn('show:error', { id, err })
    return false
  }
}

/** 单测用：重置主窗口 getter 与活跃通知引用 */
export function resetTaskDoneNotifyForTests(): void {
  getMainWindow = () => null
  activeNotifications.length = 0
  notifySeq = 0
}
