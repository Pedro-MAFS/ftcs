import { nativeTheme, type BrowserWindow } from 'electron'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'

export type UiThemeMode = 'dark' | 'light' | 'system'
export type ResolvedUiTheme = 'dark' | 'light'

const TITLEBAR: Record<ResolvedUiTheme, { bg: string; fg: string; windowBg: string }> = {
  dark: { bg: '#1a1a1a', fg: '#e4e4e4', windowBg: '#141414' },
  light: { bg: '#f4f4f5', fg: '#18181b', windowBg: '#f4f4f5' },
}

export function resolveUiThemeMode(raw: unknown): UiThemeMode {
  if (raw === 'light' || raw === 'system' || raw === 'dark') return raw
  return 'dark'
}

export function resolveEffectiveTheme(mode: UiThemeMode): ResolvedUiTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function getStoredUiThemeMode(): UiThemeMode {
  return resolveUiThemeMode(readUserPrefs().uiThemeMode)
}

export function applyNativeThemeSource(mode: UiThemeMode): void {
  nativeTheme.themeSource = mode
}

export function getTitleBarColors(mode: UiThemeMode = getStoredUiThemeMode()): {
  bg: string
  fg: string
  windowBg: string
  effective: ResolvedUiTheme
} {
  const effective = resolveEffectiveTheme(mode)
  return { ...TITLEBAR[effective], effective }
}

export function applyUiThemeMode(
  mode: UiThemeMode,
  getMainWindow: () => BrowserWindow | null,
): { ok: true; mode: UiThemeMode; effective: ResolvedUiTheme } {
  const normalized = resolveUiThemeMode(mode)
  writeUserPrefs({ uiThemeMode: normalized })
  applyNativeThemeSource(normalized)
  const colors = getTitleBarColors(normalized)
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    try {
      win.setBackgroundColor(colors.windowBg)
      if (process.platform !== 'darwin') {
        win.setTitleBarOverlay({
          color: colors.bg,
          symbolColor: colors.fg,
          height: 40,
        })
      }
    } catch (err) {
      console.warn('[ftcs:theme] update window chrome failed', err)
    }
  }
  return { ok: true, mode: normalized, effective: colors.effective }
}

export function bootstrapUiThemeFromPrefs(): void {
  applyNativeThemeSource(getStoredUiThemeMode())
}
