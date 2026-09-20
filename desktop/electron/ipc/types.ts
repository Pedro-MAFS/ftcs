export const IPC = {
  APP_GET_STATUS: 'app:get-status',
  APP_AGENT_PREFLIGHT: 'app:agent-preflight',
  OPENCODE_START: 'opencode:start',
  OPENCODE_STOP: 'opencode:stop',
  OPENCODE_RESTART: 'opencode:restart',
  OPENCODE_GET_LOGS: 'opencode:get-logs',
  OPENCODE_MCP_RECONNECT: 'opencode:mcp-reconnect',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PICK_WORKSPACE: 'settings:pick-workspace',
  SETTINGS_SET_OPEN_AT_LOGIN: 'settings:set-open-at-login',
  SETTINGS_SET_UI_THEME: 'settings:set-ui-theme',
  SETTINGS_DETECT_GOOGLE_PROXY: 'settings:detect-google-proxy',
  SETTINGS_TEST_GOOGLE_PLACES: 'settings:test-google-places',
  SETTINGS_TEST_HUNTER: 'settings:test-hunter',
  GATEWAY_PROVISION_OFFICIAL: 'gateway:provision-official',
  GATEWAY_REFRESH_OFFICIAL_MODELS: 'gateway:refresh-official-models',
  GATEWAY_REFRESH_OFFICIAL_USAGE: 'gateway:refresh-official-usage',
  GATEWAY_OPEN_OFFICIAL_RECHARGE: 'gateway:open-official-recharge',
  GATEWAY_OPEN_OFFICIAL_PORTAL: 'gateway:open-official-portal',
  LIBRARY_LIST: 'library:list',
  LIBRARY_ADD_WEBSITE: 'library:add-website',
  LIBRARY_DELETE_WEBSITE: 'library:delete-website',
  LIBRARY_LIST_DIR: 'library:list-dir',
  LIBRARY_MKDIR: 'library:mkdir',
  LIBRARY_UPLOAD_FILES: 'library:upload-files',
  LIBRARY_IMPORT_PATHS: 'library:import-paths',
  LIBRARY_IMPORT_FOLDERS: 'library:import-folders',
  LIBRARY_PASTE_CLIPBOARD: 'library:paste-clipboard',
  LIBRARY_DELETE_ENTRY: 'library:delete-entry',
  LIBRARY_RENAME: 'library:rename',
  LIBRARY_MOVE: 'library:move',
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
  EXPLORATION_START_R2: 'exploration:start-r2',
  EXPLORATION_START_R3: 'exploration:start-r3',
  EXPLORATION_GET_R2_SITES: 'exploration:get-r2-sites',
  EXPLORATION_SET_R2_SITE_ENABLED: 'exploration:set-r2-site-enabled',
  LEADS_LIST: 'leads:list',
  LEADS_SAVE_RAW: 'leads:save-raw',
  LEADS_SAVE_PEOPLE: 'leads:save-people',
  LEADS_VERIFY_PERSON_EMAIL: 'leads:verify-person-email',
  LEADS_EXPORT_CSV: 'leads:export-csv',
  LEADS_SCORE_AND_DEDUPE: 'leads:score-and-dedupe',
  LEADS_ENRICH_CONTACTS: 'leads:enrich-contacts',
  EMAIL_DRAFT_LIST: 'email:draft-list',
  EMAIL_DRAFT_GENERATE: 'email:draft-generate',
  EMAIL_DRAFT_GENERATE_SLOT: 'email:draft-generate-slot',
  EMAIL_DRAFT_GENERATE_ZH: 'email:draft-generate-zh',
  EMAIL_DRAFT_GET: 'email:draft-get',
  EMAIL_DRAFT_SAVE: 'email:draft-save',
  EMAIL_RECIPIENT_POOL: 'email:recipient-pool',
  EMAIL_DRAFT_REJECT: 'email:draft-reject',
  EMAIL_DRAFT_APPROVE: 'email:draft-approve',
  WORKFLOW_LIST_PLANS: 'workflow:list-plans',
  WORKFLOW_SAVE_PLAN: 'workflow:save-plan',
  WORKFLOW_DELETE_PLAN: 'workflow:delete-plan',
  AGENT_EVENT: 'agent:event',
  APP_OPEN_EXTERNAL: 'app:open-external',
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_LOGIN: 'auth:login',
  AUTH_CANCEL_LOGIN: 'auth:cancel-login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_OPEN_FEEDBACK: 'auth:open-feedback',
  AUTH_CHANGED: 'auth:changed',
  INBOX_GET_CONFIG: 'inbox:get-config',
  INBOX_PULL: 'inbox:pull',
  INBOX_ACK: 'inbox:ack',
  ONBOARDING_GET_STATE: 'onboarding:get-state',
  ONBOARDING_SET_STATE: 'onboarding:set-state',
  ONBOARDING_PROBE_ENV: 'onboarding:probe-env',
  RUNTIME_INSTALL_NODE: 'runtime:install-node',
  RUNTIME_INSTALL_NODE_PROGRESS: 'runtime:install-node-progress',
  RUNTIME_INSTALL_OPENCODE: 'runtime:install-opencode',
  RUNTIME_INSTALL_OPENCODE_PROGRESS: 'runtime:install-opencode-progress',
  RUNTIME_INSTALL_OFFICECLI: 'runtime:install-officecli',
  RUNTIME_INSTALL_OFFICECLI_PROGRESS: 'runtime:install-officecli-progress',
  RUNTIME_OFFICECLI_READY: 'runtime:officecli-ready',
  APP_QUIT: 'app:quit',
  UPDATE_CHECK: 'update:check',
  UPDATE_SNOOZE: 'update:snooze',
  UPDATE_DISMISS: 'update:dismiss',
  NOTIFY_SET_WORKFLOW_SUPPRESSED: 'notify:set-workflow-suppressed',
  NOTIFY_SHOW_TASK_DONE: 'notify:show-task-done',
  SCHEDULE_LIST: 'schedule:list',
  SCHEDULE_SAVE: 'schedule:save',
  SCHEDULE_DELETE: 'schedule:delete',
  SCHEDULE_MARK_RUN: 'schedule:mark-run',
  SCHEDULE_TRIGGER: 'schedule:trigger',
  APP_GET_VERSION: 'app:get-version',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_RESTART */
  SIDECAR_RESTART: 'opencode:restart',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_GET_LOGS */
  SIDECAR_GET_LOGS: 'opencode:get-logs',
} as const

export interface UpdateCheckResult {
  ok: boolean
  message: string
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  shouldNotify: boolean
  mandatory: boolean
  title: string
  notes: string[]
  downloadPage: string
  releasedAt: string | null
  checkedAt: string
  manifestUrl: string
}

export type OnboardingPhase = 'env' | 'keys' | 'tour' | 'done'

export interface OnboardingState {
  version: 1
  completed: boolean
  skipped: boolean
  phase: OnboardingPhase
  tourStep: number
  updatedAt: string
}

export type EnvProbeStatus = 'ok' | 'missing' | 'outdated' | 'error'

export interface EnvProbeItem {
  id: 'node' | 'opencode' | 'chrome' | 'officecli'
  label: string
  status: EnvProbeStatus
  detail: string
  installUrl?: string
  optional?: boolean
}

export interface EnvProbeResult {
  ok: boolean
  checkedAt: string
  items: EnvProbeItem[]
}

export type NodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type NodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface NodeInstallProgress {
  phase: NodeInstallProgressPhase
  message: string
}

export type NodeInstallResult =
  | {
      ok: true
      version: string
      method: NodeInstallMethod
      message: string
      needsRestart: false
      binaryPath: string
      logPath?: string
    }
  | {
      ok: false
      code: NodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export type OpenCodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type OpenCodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type OpenCodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OpenCodeInstallProgress {
  phase: OpenCodeInstallProgressPhase
  message: string
}

export type OpenCodeInstallResult =
  | {
      ok: true
      version: string
      method: OpenCodeInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OpenCodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export type OfficeCliInstallMethod = 'download' | 'reinstall'

export type OfficeCliInstallErrorCode =
  | 'unsupported-platform'
  | 'network'
  | 'checksum'
  | 'write-failed'
  | 'verify-failed'
  | 'busy'
  | 'unknown'

export type OfficeCliInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OfficeCliInstallProgress {
  phase: OfficeCliInstallProgressPhase
  message: string
}

export type OfficeCliInstallResult =
  | {
      ok: true
      version: string
      method: OfficeCliInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OfficeCliInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export interface OfficeCliReadyResult {
  ready: boolean
  installSupported: boolean
}

export interface AuthSessionSnapshot {
  loggedIn: boolean
  loginPending: boolean
  emailMasked: string
  scopes: string[]
  issuer: string
  clientId: string
  redirectUri: string
  expiresAt: string | null
  accessExpiresInSec: number | null
  error: string
}

export interface AuthActionResult {
  ok: boolean
  message: string
  session: AuthSessionSnapshot
  needLogin?: boolean
  promptGatewayReset?: boolean
}

export type {
  InboxAnswer,
  InboxBlock,
  InboxConfig,
  InboxMessage,
  InboxAckResult,
  InboxPullResult,
} from '../auth/inbox-types'

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
    site_id?: string
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
    site_id?: string
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

export interface ExploreR2SiteDto {
  id: string
  label: string
  include_domains: string[]
  default_enabled: boolean
  enabled: boolean
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

export interface LeadPersonDto {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  title: string
  email: string
  emailStatus: string
  confidence: number | null
  roleMatch: string
  matchReason: string
  provider: 'hunter' | 'manual'
  sources: LeadPersonSourceDto[]
  enrichedAt: string
}

export interface LeadPersonSourceDto {
  domain: string
  uri: string
  extractedOn: string
  lastSeenOn: string
  stillOnPage: boolean
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
  /** 所属探索运行；历史数据可为空 */
  runId: string
  rawScore: number | null
  dedupeKey: string
  keptLeadId: string
  discardReason: string
  company: LeadCompanyDetailDto
  source: LeadSourceDetailDto
  scoreBreakdown: LeadScoreBreakdownDto | null
  contacts: LeadContactDto[]
  contactLabel: string
  people: LeadPersonDto[]
  peopleLabel: string
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

export interface ExportLeadsCsvInput {
  content: string
  defaultFileName: string
}

export interface ExportLeadsCsvResult {
  ok: boolean
  canceled?: boolean
  path?: string
  message: string
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
  body?: string
  audience?: 'company' | 'person'
  hasCompanyDraft?: boolean
  personDraftCount?: number
  draftCount?: number
  approvedCount?: number
  pendingSlotCount?: number
  subjectZh?: string | null
  bodyZh?: string | null
  stylePrompt?: string | null
  recipientAliases?: string[]
  slots?: EmailDraftSlotDto[]
  selectedVariant: string
  variants: EmailVariantDto[]
  personalizationEvidence: string[]
  draftPath: string
  markdownPath: string
}

export interface EmailDraftSlotDto {
  slotKind: 'company' | 'person'
  recipientKey: string
  email: string
  name: string
  audience: 'company' | 'person'
  status: string
  subject: string
  draftPath: string
  hasZh: boolean
}

export interface EmailDraftsSnapshotDto {
  productId: string
  drafts: EmailDraftRowDto[]
  pendingHighLeadIds: string[]
  stats: {
    total: number
    pendingReview: number
    pendingHigh: number
    totalDraftFiles?: number
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
  /** 指定线索；不传则批量待起草的已评分线索（不限 tier） */
  leadIds?: string[]
}

export interface DraftEmailsResult {
  ok: boolean
  message: string
  productId?: string
}

export interface RejectEmailDraftInput {
  productId: string
  leadId: string
  scope?: 'slot' | 'lead'
  recipientKey?: string
}

export interface RejectEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
  scope?: 'slot' | 'lead'
  leadStatus?: string
  remainingDraftCount?: number
}

export interface EmailVariantEditDto {
  type: 'short' | 'professional'
  subject: string
  body: string
}

export interface ApproveEmailDraftInput {
  productId: string
  leadId: string
  recipientKey?: string
  selectedVariant?: 'short' | 'professional'
  variants?: EmailVariantEditDto[]
  subject?: string
  body?: string
}

export interface ApproveEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
  leadStatus?: string
  remainingDraftCount?: number
}

export interface GetEmailDraftSlotInput {
  productId: string
  leadId: string
  recipientKey: string
}

export interface EmailDraftSlotDetailDto {
  ok: boolean
  exists: boolean
  message?: string
  productId: string
  leadId: string
  recipientKey: string
  audience: 'company' | 'person'
  email: string
  name: string
  recipientAliases: string[]
  status: string
  language: string
  subject: string
  body: string
  subjectZh: string | null
  bodyZh: string | null
  zhStale?: boolean
  stylePrompt: string | null
  personalizationEvidence: string[]
  draftPath: string
  companyName: string
}

export interface SaveEmailDraftSlotInput {
  productId: string
  leadId: string
  recipientKey: string
  subject: string
  body: string
}

export interface SaveEmailDraftSlotResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
  draftPath?: string
}

export interface GetEmailRecipientPoolInput {
  productId: string
  leadId: string
}

export interface EmailRecipientPoolItemDto {
  recipientKey: string
  kind: 'company' | 'person'
  email: string | null
  emails: string[]
  displayName: string
  title: string | null
  emailLevel: 'generic' | 'personal' | null
  source: 'slot' | 'contacts' | 'people' | 'both'
  hasDraft: boolean
  draftStatus: string | null
}

export interface EmailRecipientPoolResultDto {
  ok: boolean
  message?: string
  productId: string
  leadId: string
  companyName: string
  tier: string
  leadStatus: string
  score: number | null
  pool: EmailRecipientPoolItemDto[]
  defaultRecipientKey: string
}

export interface DraftEmailSlotInput {
  productId: string
  leadId: string
  audience: 'company' | 'person'
  email?: string
  recipientKey?: string
}

export interface DraftEmailSlotResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
}

export interface GenerateEmailDraftZhInput {
  productId: string
  leadId: string
  recipientKey?: string
}

export interface GenerateEmailDraftZhResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
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

/** US-C-04：scored people 全量保存 */
export interface SaveScoredPeoplePersonInput {
  id?: string
  name: string
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  roleMatch?: string | null
  matchReason?: string
  email: string
  emailStatus?: string
  confidence?: number
  provider?: 'hunter' | 'manual'
  sources?: LeadPersonSourceDto[]
  enrichedAt?: string
}

export interface SaveScoredPeopleInput {
  productId: string
  leadId: string
  people: SaveScoredPeoplePersonInput[]
}

export interface SaveScoredPeopleResult {
  ok: boolean
  message: string
  lead?: LeadRowDto
}

export interface VerifyPersonEmailInput {
  productId: string
  leadId: string
  personId: string
}

export interface VerifyPersonEmailResult {
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
  /** 是否有 Agent 任务正在运行（停止 OpenCode 前需提示） */
  agentRunning: boolean
  devMode: boolean
  requiresLocalOpenCode: boolean
}

export interface OpenCodeActionResult {
  ok: boolean
  message: string
  status: AppStatus
}

export type AgentPreflightKind =
  | 'extract-profile'
  | 'expand-keywords'
  | 'discover-leads'
  | 'discover-leads-r2'
  | 'discover-leads-r3'
  | 'score-and-dedupe'
  | 'draft-email'
  | 'enrich-lead-contacts'

export interface AgentPreflightCheck {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface AgentPreflightResult {
  ok: boolean
  message: string
  checks: AgentPreflightCheck[]
}

export type ChannelMode = 'official' | 'custom'

export type OfficialModelsSource = 'gateway' | 'fallback' | 'none'

export interface OfficialUsageSnapshot {
  balanceLi: number
  balanceYuan: number
  balanceDisplay: string
  liPerYuan: number
  keyPrefix?: string
  todayPromptTokens: number | null
  todayCompletionTokens: number | null
  fetchedAt: number
  error?: string
}

export type GoogleProxyMode = 'off' | 'system' | 'manual'

export interface SettingsSnapshot {
  workspaceRoot: string
  channelMode: ChannelMode
  officialProvisioned: boolean
  gatewayBaseUrl: string
  gatewayKeyMasked: string
  officialModelsSource: OfficialModelsSource
  officialModelsError?: string
  officialUsage: OfficialUsageSnapshot | null
  apiKeyMasked: string
  apiKeySet: boolean
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKeyMasked: string
  tavilyApiKeySet: boolean
  placesApiKeyMasked: string
  placesApiKeySet: boolean
  placesProvider: 'custom' | 'gateway'
  hunterApiKeySet: boolean
  hunterApiKeysMasked: string
  hunterApiKeyCount: number
  hunterVerifyEmails: boolean
  googleProxyMode: GoogleProxyMode
  googleProxyManualUrl: string
  googleProxyEffectiveUrl: string
  searchDailyLimit: number
  searchUsedToday: number
  modelOptions: Array<{ id: string; label: string }>
  smallModelOptions: Array<{ id: string; label: string }>
  customModelSupportsImage: boolean
  opencodeConfigPath: string
  envPath: string
  emailDraftStylePrompt?: string
  taskDoneNotificationEnabled?: boolean
  openAtLogin?: boolean
  uiThemeMode?: 'dark' | 'light' | 'system'
}

export interface SettingsSaveInput {
  channelMode: ChannelMode
  apiKey: string
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKey: string
  placesApiKey?: string
  hunterApiKeys?: string[]
  hunterVerifyEmails?: boolean
  googleProxyMode?: GoogleProxyMode
  googleProxyManualUrl?: string
  searchDailyLimit: number
  customModelSupportsImage?: boolean
  emailDraftStylePrompt?: string
  taskDoneNotificationEnabled?: boolean
  openAtLogin?: boolean
  uiThemeMode?: 'dark' | 'light' | 'system'
}

export interface SettingsSaveResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

export interface ProvisionOfficialResult {
  ok: boolean
  needLogin?: boolean
  message: string
  action?: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialModelsResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialUsageResult {
  ok: boolean
  message: string
  usage: OfficialUsageSnapshot | null
  settings: SettingsSnapshot
}

export interface OpenOfficialRechargeResult {
  ok: boolean
  needLogin?: boolean
  message: string
}

export type OpenOfficialPortalResult = OpenOfficialRechargeResult

export interface GoogleProxyDetectResult {
  ok: boolean
  rule: string
  url: string | null
  message: string
}

export interface GooglePlacesTestResult {
  ok: boolean
  message: string
  proxyUrl?: string | null
  systemRule?: string
  httpStatus?: number
}

export interface HunterKeyTestItem {
  tail: string
  ok: boolean
  message: string
  remaining?: number | null
  resetDate?: string | null
  planName?: string | null
}

export interface HunterTestResult {
  ok: boolean
  message: string
  keys: HunterKeyTestItem[]
}

export interface EnrichLeadContactsInput {
  productId: string
  /** 单条；与 leadIds 二选一，leadIds 优先 */
  leadId?: string
  /** 批量；最多 50 */
  leadIds?: string[]
  verifyEmails?: boolean
}

export interface EnrichLeadContactsResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  leadIds?: string[]
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

export interface LibraryTreeNode {
  name: string
  kind: 'dir' | 'file' | 'website'
  relativePath: string
  depth: number
  sizeBytes?: number
  modifiedAt?: string
  url?: string
  children: LibraryTreeNode[]
}

export interface LibrarySnapshot {
  websites: WebsiteItem[]
  focusDir: string
  tree: LibraryTreeNode[]
  truncated: boolean
  filesRootLabel: string
  /** @deprecated I-01 起与 focusDir 相同 */
  cwd?: string
  entries?: FileEntry[]
}

export interface LibraryMutationResult {
  ok: boolean
  message: string
  snapshot: LibrarySnapshot
  imported?: number
  dirsCreated?: number
  skipped?: string[]
  createdPath?: string
}

export type {
  WorkflowPlan,
  WorkflowPlanStep,
  WorkflowPlanSaveInput,
  WorkflowListPlansResult,
  WorkflowSavePlanResult,
  WorkflowDeletePlanResult,
} from '../workflow/workflow-plans-types'

export type {
  WorkflowSchedule,
  WorkflowScheduleRecurrence,
  WorkflowScheduleSaveInput,
} from '../schedule/workflow-schedule-types'

