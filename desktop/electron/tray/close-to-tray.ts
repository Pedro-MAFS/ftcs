import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'

/** 关闭窗口时最小化到托盘；仅显式 true 为开启（默认关，与开机自启一致） */
export function resolveCloseToTrayEnabled(raw: unknown): boolean {
  return raw === true
}

export function isCloseToTrayEnabled(): boolean {
  return resolveCloseToTrayEnabled(readUserPrefs().closeToTrayEnabled)
}

export function applyCloseToTrayEnabled(enabled: boolean): void {
  writeUserPrefs({ closeToTrayEnabled: Boolean(enabled) })
}
