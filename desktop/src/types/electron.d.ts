import type { AppStatus, OpenCodeActionResult } from './app'
import type { AuthActionResult, AuthSessionSnapshot } from './auth'
import type { LibraryMutationResult, LibrarySnapshot } from './library'
import type { SettingsSaveInput, SettingsSaveResult, SettingsSnapshot } from './settings'
import type {
  EnvProbeResult,
  NodeInstallProgress,
  NodeInstallResult,
  OnboardingState,
  OpenCodeInstallProgress,
  OpenCodeInstallResult,
  OfficeCliInstallProgress,
  OfficeCliInstallResult,
  OfficeCliReadyResult,
} from './onboarding'
import type { UpdateCheckResult } from './update'

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
  selectedVariant: string
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
}

export interface RejectEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
}

export interface EmailVariantEditDto {
  type: 'short' | 'professional'
  subject: string
  body: string
}

export interface ApproveEmailDraftInput {
  productId: string
  leadId: string
  selectedVariant?: 'short' | 'professional'
  variants?: EmailVariantEditDto[]
}

export interface ApproveEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
}

export type AgentPreflightKind =
  | 'extract-profile'
  | 'expand-keywords'
  | 'discover-leads'
  | 'discover-leads-r2'
  | 'discover-leads-r3'
  | 'score-and-dedupe'
  | 'draft-email'

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

export interface RawLeadContactEditDto {
  type: string
  value: string
  confidence?: string
}

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

declare global {
  interface Window {
    ftcs?: {
      platform: NodeJS.Platform
      getAppStatus: () => Promise<AppStatus>
      openExternal: (url: string) => Promise<{ ok: boolean; message: string }>
      checkAgentPreflight: (kind: AgentPreflightKind) => Promise<AgentPreflightResult>
      startOpenCode: () => Promise<OpenCodeActionResult>
      stopOpenCode: () => Promise<OpenCodeActionResult>
      restartOpenCode: () => Promise<AppStatus>
      reconnectMcp: (name: string) => Promise<OpenCodeActionResult>
      getOpenCodeLogs: () => Promise<string[]>
      getAuthSession: () => Promise<AuthSessionSnapshot>
      loginWithOAuth: () => Promise<AuthActionResult>
      cancelOAuthLogin: () => Promise<AuthActionResult>
      logoutOAuth: () => Promise<AuthActionResult>
      openFeedback: () => Promise<AuthActionResult>
      getInboxConfig: () => Promise<import('./inbox').InboxConfig>
      pullInbox: (limit?: number) => Promise<import('./inbox').InboxPullResult>
      ackInbox: (input: {
        messageId: string
        answers?: import('./inbox').InboxAnswer[]
      }) => Promise<import('./inbox').InboxAckResult>
      onAuthChanged: (handler: (session: AuthSessionSnapshot) => void) => () => void
      getSettings: () => Promise<SettingsSnapshot>
      provisionOfficialChannel: (input?: {
        reset?: boolean
      }) => Promise<
        import('./settings').ProvisionOfficialResult & { status?: AppStatus }
      >
      refreshOfficialModels: () => Promise<
        import('./settings').RefreshOfficialModelsResult
      >
      refreshOfficialUsage: () => Promise<
        import('./settings').RefreshOfficialUsageResult
      >
      openOfficialRecharge: () => Promise<
        import('./settings').OpenOfficialRechargeResult
      >
      openOfficialPortal: () => Promise<
        import('./settings').OpenOfficialPortalResult
      >
      getOnboardingState: () => Promise<OnboardingState>
      setOnboardingState: (patch: Partial<OnboardingState>) => Promise<OnboardingState>
      probeEnvironment: () => Promise<EnvProbeResult>
      installNode: () => Promise<NodeInstallResult>
      onNodeInstallProgress: (handler: (progress: NodeInstallProgress) => void) => () => void
      installOpenCode: () => Promise<OpenCodeInstallResult>
      onOpenCodeInstallProgress: (
        handler: (progress: OpenCodeInstallProgress) => void,
      ) => () => void
      installOfficeCli: () => Promise<OfficeCliInstallResult>
      onOfficeCliInstallProgress: (
        handler: (progress: OfficeCliInstallProgress) => void,
      ) => () => void
      getOfficeCliReady: () => Promise<OfficeCliReadyResult>
      quitApp: () => Promise<{ ok: boolean }>
      getAppVersion: () => Promise<string>
      checkForUpdate: (opts?: { forceNotify?: boolean }) => Promise<UpdateCheckResult>
      snoozeUpdate: () => Promise<{ ok: boolean }>
      dismissUpdate: (version: string) => Promise<{ ok: boolean }>
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
      importLibraryFolders: (cwd?: string) => Promise<LibraryMutationResult>
      pasteClipboardFiles: (cwd?: string) => Promise<LibraryMutationResult>
      deleteLibraryEntry: (relativePath: string, cwd?: string) => Promise<LibraryMutationResult>
      renameLibraryEntry: (relativePath: string, newName: string, cwd?: string) => Promise<LibraryMutationResult>
      moveLibraryEntry: (relativePath: string, destDir: string, cwd?: string) => Promise<LibraryMutationResult>
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
      getExploreR2Sites: () => Promise<{
        ok: boolean
        sites: ExploreR2SiteDto[]
        message?: string
      }>
      setExploreR2SiteEnabled: (
        siteId: string,
        enabled: boolean,
      ) => Promise<{ ok: boolean; sites: ExploreR2SiteDto[]; message?: string }>
      listExploreTasks: (productId: string) => Promise<ExploreTasksSnapshotDto>
      startExploreR1: (input: DiscoverLeadsInput) => Promise<DiscoverLeadsResult>
      startExploreR2: (input: DiscoverLeadsInput) => Promise<DiscoverLeadsResult>
      startExploreR3: (input: DiscoverLeadsInput) => Promise<DiscoverLeadsResult>
      listLeads: (productId: string) => Promise<LeadsSnapshotDto>
      saveRawLead: (input: RawLeadSaveInput) => Promise<RawLeadSaveResult>
      exportLeadsCsv: (input: ExportLeadsCsvInput) => Promise<ExportLeadsCsvResult>
      scoreAndDedupeLeads: (productId: string) => Promise<ScoreAndDedupeResult>
      listEmailDrafts: (productId: string) => Promise<EmailDraftsSnapshotDto>
      draftEmails: (input: DraftEmailsInput) => Promise<DraftEmailsResult>
      rejectEmailDraft: (input: RejectEmailDraftInput) => Promise<RejectEmailDraftResult>
      approveEmailDraft: (input: ApproveEmailDraftInput) => Promise<ApproveEmailDraftResult>
      onAgentEvent: (handler: (payload: AgentEventPayload) => void) => () => void
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
