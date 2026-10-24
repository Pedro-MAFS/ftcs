import type { BrowserWindow } from 'electron'
import type { BuiltinBrowserMode } from './types'
import {
  INITIAL_VISIBLE_BEFORE,
  shouldFollowMainAnchor,
  shouldRestoreFloatingWindow,
  visibleBeforeAfterMainHide,
} from './window-policy'

const controllers = new WeakMap<BrowserWindow, MainWindowFollowController>()

export interface MainWindowFollowController {
  setVisibleBefore(value: boolean): void
}

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
): MainWindowFollowController {
  const existing = controllers.get(main)
  if (existing) return existing

  let visibleBefore = INITIAL_VISIBLE_BEFORE
  const controller: MainWindowFollowController = {
    setVisibleBefore(value: boolean) {
      visibleBefore = value
    },
  }
  controllers.set(main, controller)

  const hideWithMain = (): void => {
    visibleBefore = visibleBeforeAfterMainHide(hooks.isBrowserVisible(), visibleBefore)
    hooks.hideBrowser()
  }
  const restore = (): void => {
    if (main.isDestroyed()) return
    if (
      !shouldRestoreFloatingWindow({
        mainMinimized: main.isMinimized(),
        mainVisible: main.isVisible(),
        mode: hooks.getMode(),
        visibleBefore,
      })
    ) {
      return
    }
    hooks.showInactive()
  }

  main.on('minimize', hideWithMain)
  main.on('hide', hideWithMain)
  main.on('restore', restore)
  main.on('show', restore)
  const followAnchor = (): void => {
    if (!shouldFollowMainAnchor({ detached: hooks.isDetached(), mode: hooks.getMode() })) return
    hooks.reanchor()
  }
  main.on('move', followAnchor)
  main.on('resize', followAnchor)
  main.on('closed', () => hooks.onMainClosed())
  return controller
}
