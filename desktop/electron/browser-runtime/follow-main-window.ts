import type { BrowserWindow } from 'electron'
import type { BuiltinBrowserMode } from './types'

const bound = new WeakSet<BrowserWindow>()

export function attachMainWindowFollow(
  main: BrowserWindow,
  hooks: {
    getMode: () => BuiltinBrowserMode
    isDetached: () => boolean
    isBrowserVisible: () => boolean
    reanchor: () => void
    showInactive: () => void
    hideBrowser: () => void
    onMainClosed: () => void
  },
): void {
  if (bound.has(main)) return
  bound.add(main)
  let visibleBefore = true

  const hideWithMain = (): void => {
    if (hooks.isBrowserVisible()) visibleBefore = true
    hooks.hideBrowser()
  }
  const restore = (): void => {
    if (main.isDestroyed() || main.isMinimized() || !main.isVisible()) return
    if (!visibleBefore) return
    hooks.showInactive()
  }

  main.on('minimize', hideWithMain)
  main.on('hide', hideWithMain)
  main.on('restore', restore)
  main.on('show', restore)
  const followAnchor = (): void => {
    if (hooks.isDetached() || hooks.getMode() === 'expanded') return
    hooks.reanchor()
  }
  main.on('move', followAnchor)
  main.on('resize', followAnchor)
  main.on('closed', () => hooks.onMainClosed())
}
