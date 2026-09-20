import { app } from 'electron'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'

export function resolveOpenAtLogin(raw: unknown): boolean {
  return raw === true
}

export function isOpenAtLoginEnabled(): boolean {
  return resolveOpenAtLogin(readUserPrefs().openAtLogin)
}

/** 同步 prefs 与系统登录项；Windows 下 openAsHidden 自启不抢前台 */
export function applyOpenAtLogin(enabled: boolean): void {
  writeUserPrefs({ openAtLogin: enabled })
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
      args: enabled ? ['--hidden'] : [],
    })
  } catch (err) {
    console.warn('[ftcs:login] setLoginItemSettings failed', err)
  }
}

/** 启动时是否应先藏托盘（登录自启或 --hidden） */
export function shouldStartHidden(): boolean {
  if (process.argv.includes('--hidden')) return true
  try {
    const settings = app.getLoginItemSettings()
    if (settings.wasOpenedAtLogin) return true
  } catch {
    // ignore
  }
  return false
}

/** 应用启动时按 prefs 纠偏系统登录项 */
export function syncOpenAtLoginFromPrefs(): void {
  applyOpenAtLogin(isOpenAtLoginEnabled())
}
