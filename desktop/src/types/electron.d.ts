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
      expansion?: KeywordExpansionDto
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

export interface ProfileProductEdit {
  name?: string
  name_en?: string
  category?: string
  materials?: string[]
  specs?: string[]
  moq?: string
  price_range?: string
  use_cases?: string[]
  differentiators?: string[]
}

export interface ProfileSaveInput {
  productId: string
  company: {
    name?: string
    website?: string
    country?: string
    description?: string
    certifications?: string[]
  }
  products: ProfileProductEdit[]
  buyer_personas: Array<{
    role?: string
    company_types?: string[]
    regions?: string[]
    pain_points?: string[]
  }>
  target_markets: {
    regions?: string[]
    excluded_regions?: string[]
    languages?: string[]
  }
}

export interface ProfileSaveResult {
  ok: boolean
  message: string
  profile?: ProfileDetail
}

export interface ProfileGenerateResult {
  ok: boolean
  message: string
  productId?: string
  skipped?: string[]
}

export interface KeywordsExpandResult {
  ok: boolean
  message: string
  productId?: string
}

export interface KeywordsSaveInput {
  productId: string
  search_queries: Array<{
    id?: string
    query: string
    dimension: string
    language?: string
    priority?: string
    round?: string
  }>
}

export interface KeywordExpansionDto {
  product_id: string
  generated_at: string
  dimensions: {
    product: string[]
    scenario: string[]
    buyer: string[]
    geo: string[]
    competitor: string[]
  }
  search_queries: Array<{
    id: string
    query: string
    dimension: string
    language: string
    priority: string
    round: string
  }>
  stats: {
    total_queries: number
    by_round: Record<string, number>
    by_dimension?: Record<string, number>
  }
}

export interface KeywordsSaveResult {
  ok: boolean
  message: string
  expansion?: KeywordExpansionDto
}

export type ExploreTaskStatus =
  | 'keywords_ready'
  | 'running'
  | 'completed'
  | 'failed'

export interface ExploreTaskDto {
  id: string
  productId: string
  status: ExploreTaskStatus
  title: string
  subtitle: string
  startedAt?: string
  finishedAt?: string | null
  totalQueries: number
  queriesExecuted: number
  leadsFound: number
  leadsAfterDedupe?: number
  rounds: string[]
  dimensionCounts: Array<{ key: string; label: string; count: number }>
  sampleQueries: string[]
  expansionPath?: string
  runPath?: string
}

export interface ExploreTasksSnapshotDto {
  productId: string
  companyName?: string
  tasks: ExploreTaskDto[]
  summary: {
    total: number
    keywordsReady: number
    running: number
    completed: number
    failed: number
  }
  expansion: KeywordExpansionDto | null
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
      saveProfile: (input: ProfileSaveInput) => Promise<ProfileSaveResult>
      deleteProfile: (productId: string) => Promise<ProfileSaveResult>
      createDraftProfile: () => Promise<ProfileSaveResult>
      expandKeywords: (productId: string) => Promise<KeywordsExpandResult>
      getKeywords: (productId: string) => Promise<KeywordExpansionDto | null>
      saveKeywords: (input: KeywordsSaveInput) => Promise<KeywordsSaveResult>
      listExploreTasks: (productId: string) => Promise<ExploreTasksSnapshotDto>
      onAgentEvent: (handler: (payload: AgentEventPayload) => void) => () => void
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
