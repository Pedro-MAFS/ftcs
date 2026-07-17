export const IPC = {
  APP_GET_STATUS: 'app:get-status',
  OPENCODE_RESTART: 'opencode:restart',
  OPENCODE_GET_LOGS: 'opencode:get-logs',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PICK_WORKSPACE: 'settings:pick-workspace',
  LIBRARY_LIST: 'library:list',
  LIBRARY_ADD_WEBSITE: 'library:add-website',
  LIBRARY_DELETE_WEBSITE: 'library:delete-website',
  LIBRARY_LIST_DIR: 'library:list-dir',
  LIBRARY_MKDIR: 'library:mkdir',
  LIBRARY_UPLOAD_FILES: 'library:upload-files',
  LIBRARY_IMPORT_PATHS: 'library:import-paths',
  LIBRARY_PASTE_CLIPBOARD: 'library:paste-clipboard',
  LIBRARY_DELETE_ENTRY: 'library:delete-entry',
  PROFILE_GENERATE: 'profile:generate',
  PROFILE_ABORT: 'profile:abort',
  PROFILE_GET: 'profile:get',
  PROFILE_LIST: 'profile:list',
  PROFILE_SAVE: 'profile:save',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_CREATE_DRAFT: 'profile:create-draft',
  KEYWORDS_EXPAND: 'keywords:expand',
  KEYWORDS_GET: 'keywords:get',
  EXPLORATION_LIST_TASKS: 'exploration:list-tasks',
  AGENT_EVENT: 'agent:event',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_RESTART */
  SIDECAR_RESTART: 'opencode:restart',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_GET_LOGS */
  SIDECAR_GET_LOGS: 'opencode:get-logs',
} as const

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

export type OpenCodeRuntimeState = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

export interface OpenCodeRuntimeStatus {
  state: OpenCodeRuntimeState
  mode: 'sdk-server-client'
  port: number
  baseUrl: string
  pid?: number
  version?: string
  error?: string
  binaryPath?: string
  startedAt?: string
}

/** @deprecated 使用 OpenCodeRuntimeStatus */
export type SidecarStatus = OpenCodeRuntimeStatus
/** @deprecated 使用 OpenCodeRuntimeState */
export type SidecarState = OpenCodeRuntimeState

export interface McpServerStatus {
  name: string
  status: string
  error?: string
}

export interface AppStatus {
  workspaceRoot: string
  opencode: OpenCodeRuntimeStatus
  /** @deprecated 同 opencode */
  sidecar: OpenCodeRuntimeStatus
  opencodeHealthy: boolean
  mcpServers: McpServerStatus[]
  devMode: boolean
  requiresLocalOpenCode: boolean
}

export type ModelProviderId = 'anthropic' | 'openai' | 'google' | 'custom'

export interface SettingsSnapshot {
  workspaceRoot: string
  providerId: ModelProviderId
  apiKeyMasked: string
  apiKeySet: boolean
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKeyMasked: string
  tavilyApiKeySet: boolean
  searchDailyLimit: number
  searchUsedToday: number
  modelOptions: Array<{ id: string; label: string }>
  smallModelOptions: Array<{ id: string; label: string }>
  opencodeConfigPath: string
  envPath: string
}

export interface SettingsSaveInput {
  providerId: ModelProviderId
  apiKey: string
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKey: string
  searchDailyLimit: number
}

export interface SettingsSaveResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

export interface WebsiteItem {
  id: string
  title: string
  url: string
  relativePath: string
  createdAt?: string
  subtitle: string
}

export interface FileEntry {
  name: string
  kind: 'dir' | 'file'
  relativePath: string
  sizeBytes?: number
  modifiedAt?: string
}

export interface LibrarySnapshot {
  websites: WebsiteItem[]
  cwd: string
  entries: FileEntry[]
  filesRootLabel: string
}

export interface LibraryMutationResult {
  ok: boolean
  message: string
  snapshot: LibrarySnapshot
  imported?: number
  skipped?: string[]
}
