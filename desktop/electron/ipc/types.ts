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
  KEYWORDS_SAVE: 'keywords:save',
  EXPLORATION_LIST_TASKS: 'exploration:list-tasks',
  EXPLORATION_START_R1: 'exploration:start-r1',
  LEADS_LIST: 'leads:list',
  LEADS_SAVE_RAW: 'leads:save-raw',
  LEADS_SCORE_AND_DEDUPE: 'leads:score-and-dedupe',
  EMAIL_DRAFT_LIST: 'email:draft-list',
  EMAIL_DRAFT_GENERATE: 'email:draft-generate',
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

export interface DiscoverLeadsInput {
  productId: string
  rounds?: string[]
  maxQueries?: number
}

export interface DiscoverLeadsResult {
  ok: boolean
  message: string
  productId?: string
}

export interface ExplorationRunDto {
  id: string
  product_id: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'completed' | 'failed'
  rounds: string[]
  queries_executed: number
  leads_found: number
  leads_after_dedupe?: number
  api_usage: {
    search_calls: number
    crawl_pages: number
  }
  errors: string[]
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

export type LeadPhaseDto = 'raw' | 'scored' | 'discarded'
export type LeadTierDto = 'high' | 'medium' | 'low' | null

export interface LeadContactDto {
  type: string
  value: string
  confidence?: string
}

export interface LeadCompanyDetailDto {
  name: string
  website: string
  country: string
  description: string
}

export interface LeadSourceDetailDto {
  url: string
  type: string
  snippet: string
}

export interface LeadScoreBreakdownDto {
  product_match: number
  purchase_intent: number
  size_fit: number
  geo_match: number
  reachability: number
  competition: number
}

export interface LeadRowDto {
  id: string
  productId: string
  phase: LeadPhaseDto
  companyName: string
  domain: string
  country: string
  tier: LeadTierDto
  tierLabel: string
  score: number | null
  matchReason: string
  sourceUrl: string
  round: string
  status: string | null
  discoveredAt: string
  queryId: string
  rawScore: number | null
  dedupeKey: string
  keptLeadId: string
  discardReason: string
  company: LeadCompanyDetailDto
  source: LeadSourceDetailDto
  scoreBreakdown: LeadScoreBreakdownDto | null
  contacts: LeadContactDto[]
  contactLabel: string
  record: Record<string, unknown>
}

export interface LeadsSnapshotDto {
  productId: string
  updatedAt?: string
  rows: LeadRowDto[]
  stats: {
    total: number
    raw: number
    scored: number
    discarded: number
    byTier: { high: number; medium: number; low: number }
    pendingMail: number
  }
}

export interface ScoredLeadsSummaryDto {
  productId: string
  updatedAt: string
  total: number
  byTier: { high: number; medium: number; low: number }
}

export interface ScoreAndDedupeResult {
  ok: boolean
  message: string
  productId?: string
}

export interface EmailVariantDto {
  type: string
  subject: string
  body: string
}

export interface EmailDraftRowDto {
  id: string
  leadId: string
  productId: string
  createdAt: string
  status: string
  language: string
  companyName: string
  recipientEmail: string
  tier: string
  leadStatus: string
  score: number | null
  subject: string
  variants: EmailVariantDto[]
  personalizationEvidence: string[]
  draftPath: string
  markdownPath: string
}

export interface EmailDraftsSnapshotDto {
  productId: string
  drafts: EmailDraftRowDto[]
  pendingHighLeadIds: string[]
  stats: {
    total: number
    pendingReview: number
    pendingHigh: number
  }
}

export interface EmailDraftsSummaryDto {
  productId: string
  generatedLeadIds: string[]
  total: number
  newestCreatedAt: string
}

export interface DraftEmailsInput {
  productId: string
  /** 指定线索；不传则批量 high 待起草 */
  leadIds?: string[]
}

export interface DraftEmailsResult {
  ok: boolean
  message: string
  productId?: string
}

export interface RawLeadContactEditDto {
  type: string
  value: string
  confidence?: string
}

/** 人工编辑未评分（raw）线索 */
export interface RawLeadSaveInput {
  productId: string
  leadId: string
  company: {
    name?: string
    website?: string
    country?: string
    description?: string
  }
  source: {
    url: string
    type?: string
    snippet?: string
  }
  match_reason: string
  contacts: RawLeadContactEditDto[]
  raw_score?: number | null
}

export interface RawLeadSaveResult {
  ok: boolean
  message: string
  lead?: LeadRowDto
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
      explorationRun?: ExplorationRunDto
      scored?: ScoredLeadsSummaryDto
      emailDrafts?: EmailDraftsSummaryDto
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
