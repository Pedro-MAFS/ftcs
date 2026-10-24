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
  return { width: THUMB.width, height: THUMB.height }
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
