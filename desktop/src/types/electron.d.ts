import type { AppStatus } from './app'
import type { SettingsSaveInput, SettingsSaveResult, SettingsSnapshot } from './settings'

declare global {
  interface Window {
    ftcs?: {
      platform: NodeJS.Platform
      getAppStatus: () => Promise<AppStatus>
      restartOpenCode: () => Promise<AppStatus>
      getOpenCodeLogs: () => Promise<string[]>
      getSettings: () => Promise<SettingsSnapshot>
      saveSettings: (
        input: SettingsSaveInput,
      ) => Promise<SettingsSaveResult & { status: AppStatus }>
      pickWorkspace: () => Promise<{
        path: string | null
        restarted?: boolean
        settings?: import('./settings').SettingsSnapshot
        status?: AppStatus
      }>
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
