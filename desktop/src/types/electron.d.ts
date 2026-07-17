import type { AppStatus } from './app'
import type { LibraryMutationResult, LibrarySnapshot } from './library'
import type { SettingsSaveInput, SettingsSaveResult, SettingsSnapshot } from './settings'

export type AgentTimelineItem = {
  id: string
  kind: 'user' | 'system' | 'assistant' | 'reasoning' | 'tool' | 'error'
  time: string
  title: string
  body: string
  status?: 'running' | 'done' | 'error'
  collapsed?: boolean
}

export type AgentEventPayload =
  | {
      type: 'state'
      skill: string
      status: 'idle' | 'running' | 'done' | 'error'
      productId?: string
      meta: Array<{ label: string; value: string; tone?: string }>
    }
  | {
      type: 'timeline'
      items: AgentTimelineItem[]
    }
  | {
      type: 'done'
      ok: boolean
      productId: string
      message: string
      profile?: ProfileDetail
    }

export interface ProfileGenerateInput {
  websitePaths: string[]
  filePaths: string[]
}

export interface ProfileSummary {
  id: string
  status: string
  readinessScore?: number
  companyName?: string
  productName?: string
  productNames?: string[]
  missingFields: string[]
  profilePath: string
  updatedAt?: string
}

export interface ProfileDetail extends ProfileSummary {
  raw: Record<string, unknown>
}

export interface ProfileGenerateResult {
  ok: boolean
  message: string
  productId?: string
  skipped?: string[]
}

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
      generateProfile: (input: ProfileGenerateInput) => Promise<ProfileGenerateResult>
      abortProfile: () => Promise<{ ok: boolean }>
      getProfile: (productId: string) => Promise<ProfileDetail | null>
      listProfiles: () => Promise<ProfileSummary[]>
      onAgentEvent: (handler: (payload: AgentEventPayload) => void) => () => void
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
