import { app } from 'electron'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'

export function resolveOpenAtLogin(raw: unknown): boolean {
  return raw === true
}

export function isOpenAtLoginEnabled(): boolean {
  return resolveOpenAtLogin(readUserPrefs().openAtLogin)
}

function loginCommand() {
  return {
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: process.defaultApp ? [app.getAppPath(), '--hidden'] : ['--hidden'],
  }
}

function windowsLoginEnabled(): boolean {
  const settings = app.getLoginItemSettings(loginCommand())
  return settings.openAtLogin && settings.executableWillLaunchAtLogin
}

export function currentOpenAtLogin(): boolean {
  if (process.platform !== 'win32') return isOpenAtLoginEnabled()
  try { return windowsLoginEnabled() }
  catch (error) {
    console.warn('[ftcs:login] 无法读取系统登录项', error)
    return false
  }
}

export function applyOpenAtLogin(enabled: boolean): void {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ ...loginCommand(), openAtLogin: enabled, openAsHidden: true })
    if (windowsLoginEnabled() !== enabled) {
      throw new Error('Windows 未应用开机自启设置，请检查系统「设置 → 应用 → 启动」。')
    }
    writeUserPrefs({ openAtLogin: enabled })
    return
  }
  writeUserPrefs({ openAtLogin: enabled })
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, path: process.execPath, args: enabled ? ['--hidden'] : [] })
  } catch (error) { console.warn('[ftcs:login] 无法设置登录项', error) }
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
  try { applyOpenAtLogin(isOpenAtLoginEnabled()) }
  catch (error) { console.warn('[ftcs:login] 无法同步登录项', error) }
}
