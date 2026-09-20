export type UiThemeMode = 'dark' | 'light' | 'system'
export type ResolvedUiTheme = 'dark' | 'light'

export const UI_THEME_STORAGE_KEY = 'ftcs-ui-theme-mode'

export function resolveUiThemeMode(raw: unknown): UiThemeMode {
  if (raw === 'light' || raw === 'system' || raw === 'dark') return raw
  return 'dark'
}

export function resolveEffectiveTheme(
  mode: UiThemeMode,
  prefersDark = true,
): ResolvedUiTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export function applyDocumentTheme(effective: ResolvedUiTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = effective
}

export function readStoredUiThemeMode(): UiThemeMode {
  try {
    return resolveUiThemeMode(localStorage.getItem(UI_THEME_STORAGE_KEY))
  } catch {
    return 'dark'
  }
}

export function writeStoredUiThemeMode(mode: UiThemeMode): void {
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export const UI_THEME_TITLEBAR: Record<
  ResolvedUiTheme,
  { bg: string; fg: string; windowBg: string }
> = {
  dark: { bg: '#1a1a1a', fg: '#e4e4e4', windowBg: '#141414' },
  light: { bg: '#f4f4f5', fg: '#18181b', windowBg: '#f4f4f5' },
}
