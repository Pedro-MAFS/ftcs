import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from './ipc/types'
import type {
  AgentEventPayload,
  AppStatus,
  OpenCodeActionResult,
  ExploreTasksSnapshotDto,
  KeywordExpansionDto,
  KeywordsExpandResult,
  KeywordsSaveInput,
  KeywordsSaveResult,
  DiscoverLeadsInput,
  DiscoverLeadsResult,
  LeadsSnapshotDto,
  RawLeadSaveInput,
  RawLeadSaveResult,
  ExportLeadsCsvInput,
  ExportLeadsCsvResult,
  ScoreAndDedupeResult,
  DraftEmailsInput,
  DraftEmailsResult,
  EmailDraftsSnapshotDto,
  RejectEmailDraftInput,
  RejectEmailDraftResult,
  ApproveEmailDraftInput,
  ApproveEmailDraftResult,
  AgentPreflightKind,
  AgentPreflightResult,
  AuthActionResult,
  AuthSessionSnapshot,
  InboxAckResult,
  InboxAnswer,
  InboxConfig,
  InboxPullResult,
  LibraryMutationResult,
  LibrarySnapshot,
  ProfileDetail,
  ProfileGenerateInput,
  ProfileGenerateResult,
  ProfileSaveInput,
  ProfileSaveResult,
  ProfileSummary,
  SettingsSaveInput,
  SettingsSaveResult,
  SettingsSnapshot,
  ProvisionOfficialResult,
  RefreshOfficialModelsResult,
  RefreshOfficialUsageResult,
  OpenOfficialRechargeResult,
  OpenOfficialPortalResult,
  OnboardingState,
  EnvProbeResult,
  NodeInstallProgress,
  NodeInstallResult,
  OpenCodeInstallProgress,
  OpenCodeInstallResult,
  UpdateCheckResult,
} from './ipc/types'

const api = {
  platform: process.platform as NodeJS.Platform,
  getAppStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.APP_GET_STATUS),
  openExternal: (url: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
  checkAgentPreflight: (kind: AgentPreflightKind): Promise<AgentPreflightResult> =>
    ipcRenderer.invoke(IPC.APP_AGENT_PREFLIGHT, kind),
  startOpenCode: (): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_START),
  stopOpenCode: (): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_STOP),
  restartOpenCode: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  reconnectMcp: (name: string): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_MCP_RECONNECT, name),
  getOpenCodeLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
  getAuthSession: (): Promise<AuthSessionSnapshot> =>
    ipcRenderer.invoke(IPC.AUTH_GET_SESSION),
  loginWithOAuth: (): Promise<AuthActionResult> => ipcRenderer.invoke(IPC.AUTH_LOGIN),
  cancelOAuthLogin: (): Promise<AuthActionResult> =>
    ipcRenderer.invoke(IPC.AUTH_CANCEL_LOGIN),
  logoutOAuth: (): Promise<AuthActionResult> => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  openFeedback: (): Promise<AuthActionResult> =>
    ipcRenderer.invoke(IPC.AUTH_OPEN_FEEDBACK),
  getInboxConfig: (): Promise<InboxConfig> =>
    ipcRenderer.invoke(IPC.INBOX_GET_CONFIG),
  pullInbox: (limit?: number): Promise<InboxPullResult> =>
    ipcRenderer.invoke(IPC.INBOX_PULL, limit),
  ackInbox: (input: {
    messageId: string
    answers?: InboxAnswer[]
  }): Promise<InboxAckResult> => ipcRenderer.invoke(IPC.INBOX_ACK, input),
  onAuthChanged: (handler: (session: AuthSessionSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, session: AuthSessionSnapshot) => {
      handler(session)
    }
    ipcRenderer.on(IPC.AUTH_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(IPC.AUTH_CHANGED, listener)
    }
  },
  getSettings: (): Promise<SettingsSnapshot> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  provisionOfficialChannel: (input?: {
    reset?: boolean
  }): Promise<ProvisionOfficialResult & { status?: AppStatus }> =>
    ipcRenderer.invoke(IPC.GATEWAY_PROVISION_OFFICIAL, input ?? {}),
  refreshOfficialModels: (): Promise<RefreshOfficialModelsResult> =>
    ipcRenderer.invoke(IPC.GATEWAY_REFRESH_OFFICIAL_MODELS),
  refreshOfficialUsage: (): Promise<RefreshOfficialUsageResult> =>
    ipcRenderer.invoke(IPC.GATEWAY_REFRESH_OFFICIAL_USAGE),
  openOfficialRecharge: (): Promise<OpenOfficialRechargeResult> =>
    ipcRenderer.invoke(IPC.GATEWAY_OPEN_OFFICIAL_RECHARGE),
  openOfficialPortal: (): Promise<OpenOfficialPortalResult> =>
    ipcRenderer.invoke(IPC.GATEWAY_OPEN_OFFICIAL_PORTAL),
  getOnboardingState: (): Promise<OnboardingState> =>
    ipcRenderer.invoke(IPC.ONBOARDING_GET_STATE),
  setOnboardingState: (patch: Partial<OnboardingState>): Promise<OnboardingState> =>
    ipcRenderer.invoke(IPC.ONBOARDING_SET_STATE, patch),
  probeEnvironment: (): Promise<EnvProbeResult> =>
    ipcRenderer.invoke(IPC.ONBOARDING_PROBE_ENV),
  installNode: (): Promise<NodeInstallResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_INSTALL_NODE),
  onNodeInstallProgress: (
    handler: (progress: NodeInstallProgress) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: NodeInstallProgress,
    ) => {
      handler(progress)
    }
    ipcRenderer.on(IPC.RUNTIME_INSTALL_NODE_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.RUNTIME_INSTALL_NODE_PROGRESS, listener)
    }
  },
  installOpenCode: (): Promise<OpenCodeInstallResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_INSTALL_OPENCODE),
  onOpenCodeInstallProgress: (
    handler: (progress: OpenCodeInstallProgress) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: OpenCodeInstallProgress,
    ) => {
      handler(progress)
    }
    ipcRenderer.on(IPC.RUNTIME_INSTALL_OPENCODE_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.RUNTIME_INSTALL_OPENCODE_PROGRESS, listener)
    }
  },
  quitApp: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.APP_QUIT),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  checkForUpdate: (opts?: { forceNotify?: boolean }): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK, opts ?? {}),
  snoozeUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.UPDATE_SNOOZE),
  dismissUpdate: (version: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.UPDATE_DISMISS, version),
  saveSettings: (
    input: SettingsSaveInput,
  ): Promise<SettingsSaveResult & { status: AppStatus }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SAVE, input),
  pickWorkspace: (): Promise<{ path: string | null }> =>
    ipcRenderer.invoke(IPC.SETTINGS_PICK_WORKSPACE),
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  listLibrary: (cwd = ''): Promise<LibrarySnapshot> =>
    ipcRenderer.invoke(IPC.LIBRARY_LIST, cwd),
  addWebsite: (url: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_ADD_WEBSITE, url, cwd),
  deleteWebsite: (relativePath: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_DELETE_WEBSITE, relativePath, cwd),
  listLibraryDir: (cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_LIST_DIR, cwd),
  createLibraryFolder: (name: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_MKDIR, { cwd, name }),
  uploadLibraryFiles: (cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_UPLOAD_FILES, cwd),
  importLibraryPaths: (paths: string[], cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_IMPORT_PATHS, { cwd, paths }),
  importLibraryFolders: (cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_IMPORT_FOLDERS, cwd),
  pasteClipboardFiles: (cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_PASTE_CLIPBOARD, cwd),
  deleteLibraryEntry: (relativePath: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_DELETE_ENTRY, { relativePath, cwd }),
  generateProfile: (input: ProfileGenerateInput): Promise<ProfileGenerateResult> =>
    ipcRenderer.invoke(IPC.PROFILE_GENERATE, input),
  abortProfile: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.PROFILE_ABORT),
  getProfile: (productId: string): Promise<ProfileDetail | null> =>
    ipcRenderer.invoke(IPC.PROFILE_GET, productId),
  listProfiles: (): Promise<ProfileSummary[]> => ipcRenderer.invoke(IPC.PROFILE_LIST),
  saveProfile: (input: ProfileSaveInput): Promise<ProfileSaveResult> =>
    ipcRenderer.invoke(IPC.PROFILE_SAVE, input),
  deleteProfile: (productId: string): Promise<ProfileSaveResult> =>
    ipcRenderer.invoke(IPC.PROFILE_DELETE, productId),
  createDraftProfile: (): Promise<ProfileSaveResult> =>
    ipcRenderer.invoke(IPC.PROFILE_CREATE_DRAFT),
  expandKeywords: (productId: string): Promise<KeywordsExpandResult> =>
    ipcRenderer.invoke(IPC.KEYWORDS_EXPAND, productId),
  getKeywords: (productId: string): Promise<KeywordExpansionDto | null> =>
    ipcRenderer.invoke(IPC.KEYWORDS_GET, productId),
  saveKeywords: (input: KeywordsSaveInput): Promise<KeywordsSaveResult> =>
    ipcRenderer.invoke(IPC.KEYWORDS_SAVE, input),
  listExploreTasks: (productId: string): Promise<ExploreTasksSnapshotDto> =>
    ipcRenderer.invoke(IPC.EXPLORATION_LIST_TASKS, productId),
  startExploreR1: (input: DiscoverLeadsInput): Promise<DiscoverLeadsResult> =>
    ipcRenderer.invoke(IPC.EXPLORATION_START_R1, input),
  listLeads: (productId: string): Promise<LeadsSnapshotDto> =>
    ipcRenderer.invoke(IPC.LEADS_LIST, productId),
  saveRawLead: (input: RawLeadSaveInput): Promise<RawLeadSaveResult> =>
    ipcRenderer.invoke(IPC.LEADS_SAVE_RAW, input),
  exportLeadsCsv: (input: ExportLeadsCsvInput): Promise<ExportLeadsCsvResult> =>
    ipcRenderer.invoke(IPC.LEADS_EXPORT_CSV, input),
  scoreAndDedupeLeads: (productId: string): Promise<ScoreAndDedupeResult> =>
    ipcRenderer.invoke(IPC.LEADS_SCORE_AND_DEDUPE, productId),
  listEmailDrafts: (productId: string): Promise<EmailDraftsSnapshotDto> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_LIST, productId),
  draftEmails: (input: DraftEmailsInput): Promise<DraftEmailsResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_GENERATE, input),
  rejectEmailDraft: (input: RejectEmailDraftInput): Promise<RejectEmailDraftResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_REJECT, input),
  approveEmailDraft: (input: ApproveEmailDraftInput): Promise<ApproveEmailDraftResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_APPROVE, input),
  onAgentEvent: (handler: (payload: AgentEventPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEventPayload) => {
      handler(payload)
    }
    ipcRenderer.on(IPC.AGENT_EVENT, listener)
    return () => {
      ipcRenderer.removeListener(IPC.AGENT_EVENT, listener)
    }
  },
  restartSidecar: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  getSidecarLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
}

contextBridge.exposeInMainWorld('ftcs', api)

export type FtcsDesktopApi = typeof api
