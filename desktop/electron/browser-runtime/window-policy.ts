import { CAPTION_HEIGHT, THUMB } from './anchor'
import type { BuiltinBrowserMode } from './types'

/** 冷启动 `visibleBefore`。为 true 时主窗一恢复就会把浏览窗弹出。 */
export const INITIAL_VISIBLE_BEFORE = false

export function modeAfterEnsure(): BuiltinBrowserMode {
  return 'hidden'
}

/** 收起、关闭、以及非退出路径上的 window close，都是这一态。 */
export function modeAfterUserDismiss(): BuiltinBrowserMode {
  return 'hidden'
}

export function isBuiltinBrowserMode(value: unknown): value is BuiltinBrowserMode {
  return value === 'hidden' || value === 'thumbnail' || value === 'expanded'
}

/**
 * 缩略蒙层是盖在页面上的子 WebContentsView。data URL 上 preload 经常不注入，
 * `-webkit-app-region: drag` 又会吞掉按钮点击，而且拖不动这扇窗。
 * 页面脚本用这个前缀打日志，主进程只在标题条和蒙层的 webContents 上解析。
 */
export const CHROME_COMMAND_PREFIX = 'FTCS_CHROME '

export type ChromeCommand =
  | { type: 'mode'; mode: BuiltinBrowserMode }
  | { type: 'drag-start'; screenX: number; screenY: number }
  | { type: 'drag-move'; screenX: number; screenY: number }
  | { type: 'drag-end' }
  | { type: 'select-tab'; id: string }
  | { type: 'close-tab'; id: string }

export function parseChromeCommand(raw: string): ChromeCommand | null {
  const marker = raw.indexOf(CHROME_COMMAND_PREFIX)
  if (marker < 0) return null
  const jsonStart = raw.indexOf('{', marker)
  const jsonEnd = raw.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) return null
  let data: unknown
  try {
    data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const record = data as {
    type?: unknown
    mode?: unknown
    screenX?: unknown
    screenY?: unknown
    id?: unknown
  }
  if (record.type === 'mode' && isBuiltinBrowserMode(record.mode)) {
    return { type: 'mode', mode: record.mode }
  }
  if (record.type === 'select-tab' || record.type === 'close-tab') {
    if (typeof record.id !== 'string' || !record.id.trim()) return null
    return { type: record.type, id: record.id }
  }
  if (record.type === 'drag-start' || record.type === 'drag-move') {
    if (!isFiniteCoord(record.screenX) || !isFiniteCoord(record.screenY)) return null
    return { type: record.type, screenX: record.screenX, screenY: record.screenY }
  }
  if (record.type === 'drag-end') return { type: 'drag-end' }
  return null
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isBusinessNavigation(url: string): boolean {
  if (!url || url.startsWith('about:')) return false
  if (url.includes('/__ftcs_builtin_page__')) return false
  return /^https?:\/\//i.test(url)
}

/**
 * 只有收起态遇到离开令牌页的 http(s) 才弹出缩略。
 * 已经是缩略或放大时，导航不改 mode。
 */
export function navigationMode(current: BuiltinBrowserMode, url: string): BuiltinBrowserMode {
  if (current === 'hidden' && isBusinessNavigation(url)) return 'thumbnail'
  return current
}

/** 进入放大清掉拖离；进入收起保留，下次缩略用上次位置。 */
export function detachedAfterMode(detached: boolean, next: BuiltinBrowserMode): boolean {
  if (next === 'expanded') return false
  return detached
}

export function viewportForMode(
  mode: BuiltinBrowserMode,
  frame: { width: number; height: number },
): { width: number; height: number } {
  if (mode === 'expanded') {
    return {
      width: frame.width,
      height: Math.max(1, frame.height - CAPTION_HEIGHT),
    }
  }
  return {
    width: THUMB.width,
    height: Math.max(1, THUMB.height - CAPTION_HEIGHT),
  }
}

export function showsThumbnailOverlay(mode: BuiltinBrowserMode): boolean {
  return mode === 'thumbnail'
}

export function titleBarRequestsRaise(state: {
  alive: boolean
  visible: boolean
  mode: BuiltinBrowserMode
}): boolean {
  return state.alive && state.visible && (state.mode === 'thumbnail' || state.mode === 'expanded')
}

export function builtinBrowserEntryLabel(state: {
  alive: boolean
  visible: boolean
  mode: BuiltinBrowserMode
}): '打开浏览窗' | '浏览中' {
  return titleBarRequestsRaise(state) ? '浏览中' : '打开浏览窗'
}

/**
 * 主窗隐藏时，只有当时看得见的浮动窗才记「恢复后要再显示」。
 * 已经收起的不要被改成 true。
 */
export function visibleBeforeAfterMainHide(currentlyVisible: boolean, previous: boolean): boolean {
  return currentlyVisible ? true : previous
}

export function shouldRestoreFloatingWindow(input: {
  mainMinimized: boolean
  mainVisible: boolean
  mode: BuiltinBrowserMode
  visibleBefore: boolean
}): boolean {
  if (input.mainMinimized || !input.mainVisible) return false
  if (input.mode !== 'thumbnail' && input.mode !== 'expanded') return false
  return input.visibleBefore
}

/**
 * 主窗移动时，只有未拖离的缩略窗跟着走。
 * 放大不跟。收起不改外框，也不因此 show；下次进入缩略再按当时主窗算锚点。
 */
export function shouldFollowMainAnchor(input: {
  detached: boolean
  mode: BuiltinBrowserMode
}): boolean {
  return !input.detached && input.mode === 'thumbnail'
}

/**
 * 应用失焦再获焦时，只重绘已经显示的缩略或放大。
 * 收起态、以及当时不可见的窗，不要被这次重绘唤起。
 */
export function shouldRepaintBuiltinBrowser(input: {
  mode: BuiltinBrowserMode
  visible: boolean
}): boolean {
  if (!input.visible) return false
  return input.mode === 'thumbnail' || input.mode === 'expanded'
}
