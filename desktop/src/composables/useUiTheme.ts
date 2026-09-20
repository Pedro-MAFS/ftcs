import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import {
  applyDocumentTheme,
  readStoredUiThemeMode,
  resolveEffectiveTheme,
  resolveUiThemeMode,
  writeStoredUiThemeMode,
  type ResolvedUiTheme,
  type UiThemeMode,
} from '../utils/ui-theme'

const mode = ref<UiThemeMode>(readStoredUiThemeMode())
const effective = ref<ResolvedUiTheme>(
  resolveEffectiveTheme(
    mode.value,
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true,
  ),
)

let media: MediaQueryList | null = null
let bound = false

function prefersDarkNow(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function refreshEffective(): void {
  effective.value = resolveEffectiveTheme(mode.value, prefersDarkNow())
  applyDocumentTheme(effective.value)
}

function onMediaChange(): void {
  if (mode.value !== 'system') return
  refreshEffective()
  void window.ftcs?.setUiTheme?.(mode.value)
}

export function useUiTheme(): {
  mode: Ref<UiThemeMode>
  effective: Ref<ResolvedUiTheme>
  setMode: (next: UiThemeMode) => Promise<void>
  syncFromSettings: (raw: unknown) => void
} {
  onMounted(() => {
    if (bound) {
      refreshEffective()
      return
    }
    bound = true
    refreshEffective()
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onMediaChange)
  })

  onUnmounted(() => {
    // 主题监听挂在 App 根，勿在子组件卸载时拆除
  })

  async function setMode(next: UiThemeMode): Promise<void> {
    const normalized = resolveUiThemeMode(next)
    mode.value = normalized
    writeStoredUiThemeMode(normalized)
    refreshEffective()
    if (window.ftcs?.setUiTheme) {
      await window.ftcs.setUiTheme(normalized)
    }
  }

  function syncFromSettings(raw: unknown): void {
    const normalized = resolveUiThemeMode(raw)
    mode.value = normalized
    writeStoredUiThemeMode(normalized)
    refreshEffective()
  }

  return { mode, effective, setMode, syncFromSettings }
}

/** App 启动时调用一次，保证监听系统主题 */
export function ensureUiThemeListener(): void {
  refreshEffective()
  if (typeof window === 'undefined') return
  if (!media) {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onMediaChange)
  }
}
