import type { ScreenRect } from './types'

export const THUMB = { width: 360, height: 240 }
export const CARD = { width: 360, height: 40 }
export const MARGIN = 12
export const EXPANDED_INSET = 48
/** 与界面 `--titlebar-height` 一致。浏览窗上缘在标题栏之下，避免盖住设置和运行状态。 */
export const TITLE_BAR_HEIGHT = 44
export const CAPTION_HEIGHT = 40
/** 与 `.app-toast-stack` 一致：right 16，宽 min(360, 100vw - 32)。 */
export const TIP_RIGHT = 16
export const TIP_MAX_WIDTH = 360

export function tipStripWidth(mainWidth: number): number {
  return Math.min(TIP_MAX_WIDTH, Math.max(0, mainWidth - TIP_RIGHT * 2))
}

/**
 * 主内容区右上：上缘在标题栏下 12，右缘停在右上角提示条左边。
 * 视觉稿 1280 宽时缩略窗落在 (532, 56)，不贴窗口外框右上，也不落右下。
 */
export function anchorTopRight(
  main: ScreenRect,
  size: { width: number; height: number },
  workArea: ScreenRect,
): ScreenRect {
  const reserved = TIP_RIGHT + tipStripWidth(main.width) + MARGIN
  let x = main.x + main.width - reserved - size.width
  let y = main.y + TITLE_BAR_HEIGHT + MARGIN
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - size.width))
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - size.height))
  return { x, y, width: size.width, height: size.height }
}

export function anchorExpanded(workArea: ScreenRect): ScreenRect {
  const width = Math.min(workArea.width, Math.max(THUMB.width, workArea.width - EXPANDED_INSET * 2))
  const height = Math.min(
    workArea.height,
    Math.max(THUMB.height, workArea.height - EXPANDED_INSET * 2),
  )
  const x = workArea.x + Math.floor((workArea.width - width) / 2)
  const y = workArea.y + Math.floor((workArea.height - height) / 2)
  return { x, y, width, height }
}
