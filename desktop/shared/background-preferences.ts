export type CloseAction = 'ask' | 'background' | 'quit'
export interface CloseChoice { action: 'background' | 'quit' | 'cancel'; remember: boolean }

export interface BackgroundPreferences {
  closeAction: CloseAction
  backgroundMascotEnabled: boolean
}
export type StartupPreferences = BackgroundPreferences & { openAtLogin: boolean }
export type BackgroundUpdate = Partial<BackgroundPreferences>

interface StoredPreferences {
  closeAction?: unknown
  backgroundMascotEnabled?: unknown
  closeToTrayEnabled?: unknown
}

function validAction(value: unknown): value is CloseAction {
  return value === 'ask' || value === 'background' || value === 'quit'
}

export function validBackgroundUpdate(value: unknown): value is BackgroundUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every(key =>
    key === 'closeAction' ? validAction(Reflect.get(value, key)) :
    key === 'backgroundMascotEnabled' && typeof Reflect.get(value, key) === 'boolean')
}

export function backgroundPreferences(raw: StoredPreferences): BackgroundPreferences {
  const legacyTray = raw.closeToTrayEnabled === true
  return {
    closeAction: validAction(raw.closeAction) ? raw.closeAction : legacyTray ? 'background' : 'ask',
    backgroundMascotEnabled: raw.backgroundMascotEnabled !== false,
  }
}
