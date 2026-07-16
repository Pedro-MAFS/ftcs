import type { AppStatus } from './app'
import type { LibraryMutationResult, LibrarySnapshot } from './library'
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
      getPathForFile: (file: File) => string
      listLibrary: (cwd?: string) => Promise<LibrarySnapshot>
      addWebsite: (url: string, cwd?: string) => Promise<LibraryMutationResult>
      deleteWebsite: (relativePath: string, cwd?: string) => Promise<LibraryMutationResult>
      listLibraryDir: (cwd?: string) => Promise<LibraryMutationResult>
      createLibraryFolder: (name: string, cwd?: string) => Promise<LibraryMutationResult>
      uploadLibraryFiles: (cwd?: string) => Promise<LibraryMutationResult>
      importLibraryPaths: (paths: string[], cwd?: string) => Promise<LibraryMutationResult>
      pasteClipboardFiles: (cwd?: string) => Promise<LibraryMutationResult>
      deleteLibraryEntry: (relativePath: string, cwd?: string) => Promise<LibraryMutationResult>
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
