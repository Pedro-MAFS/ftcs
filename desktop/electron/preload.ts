import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from './ipc/types'
import type { CloudflareState, CloudflareAction } from './cloudflare/cloudflare-auth'
import type { GithubState, GithubStart, GithubPoll } from './github/github-auth'
import type { GithubRepository, GithubBranch } from './github/github-repositories'
import type { SiteSnapshot } from './site/site-project'
import type { SiteSourceSnapshot } from './site/site-source-tracker'
import type { ReleaseRecord, PublishPreview } from './site/site-publish'
import type { PagesProject, PagesStatus } from './cloudflare/cloudflare-pages'
import type { RunKind, SiteRuntimeSnapshot } from './site/site-runtime'
import type { SendFreeDialogueResult } from './opencode/free-dialogue'
import type {
  AgentEventPayload,
  ReplyQuestionInput,
  ReplyQuestionResult,
  ReplyPermissionResult,
  AppStatus,
  OpenCodeActionResult,
  ExploreTasksSnapshotDto,
  KeywordExpansionDto,
  KeywordsExpandResult,
  KeywordsSaveInput,
  KeywordsSaveResult,
  ExploreR2SiteDto,
  DiscoverLeadsInput,
  DiscoverLeadsResult,
  LeadsSnapshotDto,
  RawLeadSaveInput,
  RawLeadSaveResult,
  SaveLeadIcebreakInput,
  SaveLeadIcebreakResult,
  ExportLeadsCsvInput,
  ExportLeadsCsvResult,
  ScoreAndDedupeResult,
  DraftEmailsInput,
  DraftEmailsResult,
  DraftEmailSlotInput,
  DraftEmailSlotResult,
  GenerateEmailDraftZhInput,
  GenerateEmailDraftZhResult,
  EmailDraftsSnapshotDto,
  EmailDraftSlotDetailDto,
  EmailRecipientPoolResultDto,
  GetEmailDraftSlotInput,
  GetEmailRecipientPoolInput,
  SaveEmailDraftSlotInput,
  SaveEmailDraftSlotResult,
  RejectEmailDraftInput,
  RejectEmailDraftResult,
  ApproveEmailDraftInput,
  ApproveEmailDraftResult,
  AgentPreflightKind,
  AgentPreflightOptions,
  AgentPreflightResult,
  BuiltinBrowserSlot,
  BuiltinBrowserTabsPayload,
  BuiltinBrowserUiState,
  MainViewLayout,
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
  PlacesOfficialIpcResult,
  BusinessGuideState,
  OnboardingState,
  EnvProbeResult,
  NodeInstallProgress,
  NodeInstallResult,
  OpenCodeInstallProgress,
  OpenCodeInstallResult,
  OfficeCliInstallProgress,
  OfficeCliInstallResult,
  OfficeCliReadyResult,
  UpdateCheckResult,
  UpdateDownloadState,
  SaveTextToDownloadsInput,
  SaveTextToDownloadsResult,
  WorkflowDeletePlanResult,
  WorkflowListPlansResult,
  WorkflowPlanSaveInput,
  WorkflowSavePlanResult,
} from './ipc/types'

const api = {
  platform: process.platform as NodeJS.Platform,
  getAppStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.APP_GET_STATUS),
  getSite: (): Promise<SiteSnapshot> => ipcRenderer.invoke(IPC.SITE_GET),
  getSiteSource: (root: string): Promise<SiteSourceSnapshot> => ipcRenderer.invoke(IPC.SITE_SOURCE_GET, root),
  onSiteSource: (callback: (snapshot: SiteSourceSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: SiteSourceSnapshot) => callback(snapshot)
    ipcRenderer.on(IPC.SITE_SOURCE_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.SITE_SOURCE_EVENT, listener)
  },
  getSiteRelease: (root: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_GET, root),
  getAgentSiteRelease: (root: string): Promise<PublishPreview | null> => ipcRenderer.invoke(IPC.SITE_AGENT_RELEASE_GET, root),
  clearAgentSiteRelease: (root: string): Promise<void> => ipcRenderer.invoke(IPC.SITE_AGENT_RELEASE_CLEAR, root),
  onAgentSiteRelease: (callback: (value: { root: string; preview: PublishPreview }) => void): (() => void) => {
    const listener = (_event: unknown, value: { root: string; preview: PublishPreview }) => callback(value)
    ipcRenderer.on(IPC.SITE_AGENT_RELEASE_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.SITE_AGENT_RELEASE_EVENT, listener)
  },
  prepareSiteRelease: (root: string, id: number, branch: string, acceptReadme: boolean): Promise<{ ok: true; value: PublishPreview } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_PREPARE, root, id, branch, acceptReadme),
  cancelSiteRelease: (root: string): Promise<{ ok: true; value: void } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_CANCEL, root),
  getSiteReleaseFile: (root: string, id: string, name: string): Promise<{ ok: true; value: { text?: string; message?: string } } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_FILE, root, id, name),
  commitSiteRelease: (root: string, id: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_COMMIT, root, id),
  recoverSiteRelease: (root: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_RELEASE_RECOVER, root),
  listSitePages: (root: string): Promise<{ ok: true; value: { accountId: string; projects: PagesProject[] } } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_LIST, root),
  createSitePages: (root: string, name: string, nodeVersion: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_CREATE, root, name, nodeVersion),
  clearPendingSitePages: (root: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_CLEAR_PENDING, root),
  bindSitePages: (root: string, name: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_BIND, root, name),
  getSitePagesStatus: (root: string): Promise<{ ok: true; value: PagesStatus } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_STATUS, root),
  startSiteDeployment: (root: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_DEPLOY, root),
  clearSitePendingDeployment: (root: string): Promise<{ ok: true; value: ReleaseRecord } | { ok: false; message: string }> => ipcRenderer.invoke(IPC.SITE_PAGES_CLEAR_DEPLOYMENT, root),
  createSite: (workspaceRoot: string): Promise<{ ok: boolean; snapshot?: SiteSnapshot; message?: string }> => ipcRenderer.invoke(IPC.SITE_CREATE, workspaceRoot),
  adoptSite: (workspaceRoot: string): Promise<{ ok: boolean; snapshot?: SiteSnapshot; message?: string }> => ipcRenderer.invoke(IPC.SITE_ADOPT, workspaceRoot),
  openSiteDirectory: (kind: 'project' | 'workspace', workspaceRoot: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_OPEN_DIRECTORY, kind, workspaceRoot),
  getSiteRuntime: (root: string): Promise<SiteRuntimeSnapshot> => ipcRenderer.invoke(IPC.SITE_RUNTIME_GET, root),
  onSiteRuntime: (callback: (snapshot: SiteRuntimeSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: SiteRuntimeSnapshot) => callback(snapshot)
    ipcRenderer.on(IPC.SITE_RUNTIME_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.SITE_RUNTIME_EVENT, listener)
  },
  installSiteDependencies: (root: string, reinstall: boolean, thenPreview: boolean): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_INSTALL, root, reinstall, thenPreview),
  startSitePreview: (root: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_PREVIEW, root),
  setSitePreviewAddress: (root: string, id: string, url: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_ADDRESS, root, id, url),
  openSitePreview: (root: string, id: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_OPEN, root, id),
  buildSite: (root: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_BUILD, root),
  setSiteOutput: (root: string, output: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_OUTPUT, root, output),
  cancelSiteRun: (root: string, kind: RunKind, id: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke(IPC.SITE_RUNTIME_CANCEL, root, kind, id),
  openExternal: (url: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
  checkAgentPreflight: (
    kind: AgentPreflightKind,
    options?: AgentPreflightOptions,
  ): Promise<AgentPreflightResult> =>
    ipcRenderer.invoke(IPC.APP_AGENT_PREFLIGHT, kind, options),
  getBuiltinBrowserState: (): Promise<BuiltinBrowserUiState> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_GET_STATE),
  showBuiltinBrowser: (): Promise<BuiltinBrowserUiState> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_SHOW),
  onBuiltinBrowserState: (callback: (state: BuiltinBrowserUiState) => void): (() => void) => {
    const listener = (_event: unknown, state: BuiltinBrowserUiState) => callback(state)
    ipcRenderer.on(IPC.BUILTIN_BROWSER_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.BUILTIN_BROWSER_STATE, listener)
  },
  getBuiltinBrowserTabs: (): Promise<BuiltinBrowserTabsPayload> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_GET_TABS),
  onBuiltinBrowserTabs: (callback: (payload: BuiltinBrowserTabsPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: BuiltinBrowserTabsPayload) => callback(payload)
    ipcRenderer.on(IPC.BUILTIN_BROWSER_TABS, listener)
    return () => ipcRenderer.removeListener(IPC.BUILTIN_BROWSER_TABS, listener)
  },
  openBuiltinBrowserTab: (): Promise<{ key: string }> => ipcRenderer.invoke(IPC.BUILTIN_BROWSER_OPEN),
  closeBuiltinBrowserTab: (key: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_CLOSE, key),
  navigateBuiltinBrowser: (key: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_NAVIGATE, key, url),
  controlBuiltinBrowser: (key: string, action: 'back' | 'forward' | 'reload'): Promise<void> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_CONTROL, key, action),
  setBuiltinBrowserSlot: (slot: BuiltinBrowserSlot): Promise<void> =>
    ipcRenderer.invoke(IPC.BUILTIN_BROWSER_SET_SLOT, slot),
  getMainViewLayout: (): Promise<MainViewLayout | null> => ipcRenderer.invoke(IPC.LAYOUT_GET),
  setMainViewLayout: (layout: MainViewLayout): Promise<MainViewLayout | null> =>
    ipcRenderer.invoke(IPC.LAYOUT_SET, layout),
  startOpenCode: (): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_START),
  stopOpenCode: (): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_STOP),
  restartOpenCode: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  reconnectMcp: (name: string): Promise<OpenCodeActionResult> =>
    ipcRenderer.invoke(IPC.OPENCODE_MCP_RECONNECT, name),
  getOpenCodeLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
  getCloudflareState: (): Promise<CloudflareState> => ipcRenderer.invoke(IPC.CLOUDFLARE_GET_STATE),
  connectCloudflare: (): Promise<CloudflareAction> => ipcRenderer.invoke(IPC.CLOUDFLARE_CONNECT),
  cancelCloudflareAuth: (): Promise<void> => ipcRenderer.invoke(IPC.CLOUDFLARE_CANCEL),
  selectCloudflareAccount: (accountId: string): Promise<CloudflareAction> => ipcRenderer.invoke(IPC.CLOUDFLARE_SELECT_ACCOUNT, accountId),
  disconnectCloudflare: (): Promise<void> => ipcRenderer.invoke(IPC.CLOUDFLARE_DISCONNECT),
  getGithubState: (): Promise<GithubState> => ipcRenderer.invoke(IPC.GITHUB_GET_STATE),
  listGithubRepositories: (root: string): Promise<{ ok: boolean; repositories?: GithubRepository[]; message?: string }> => ipcRenderer.invoke(IPC.GITHUB_REPOSITORIES, root),
  listGithubBranches: (root: string, id: number): Promise<{ ok: boolean; branches?: GithubBranch[]; message?: string }> => ipcRenderer.invoke(IPC.GITHUB_BRANCHES, root, id),
  createGithubRepository: (root: string, name: string, privateRepo: boolean): Promise<{ ok: boolean; repository?: { fullName: string }; message?: string }> => ipcRenderer.invoke(IPC.GITHUB_CREATE_REPOSITORY, root, name, privateRepo),
  startGithubAuth: (): Promise<GithubStart> => ipcRenderer.invoke(IPC.GITHUB_START_AUTH),
  pollGithubAuth: (): Promise<GithubPoll> => ipcRenderer.invoke(IPC.GITHUB_POLL_AUTH),
  cancelGithubAuth: (): Promise<void> => ipcRenderer.invoke(IPC.GITHUB_CANCEL_AUTH),
  disconnectGithub: (): Promise<void> => ipcRenderer.invoke(IPC.GITHUB_DISCONNECT),
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
  detectGoogleProxy: (): Promise<import('./ipc/types').GoogleProxyDetectResult> =>
    ipcRenderer.invoke(IPC.SETTINGS_DETECT_GOOGLE_PROXY),
  testGooglePlaces: (input?: {
    mode?: 'off' | 'system' | 'manual'
    manualProxyUrl?: string
  }): Promise<import('./ipc/types').GooglePlacesTestResult> =>
    ipcRenderer.invoke(IPC.SETTINGS_TEST_GOOGLE_PLACES, input),
  testHunter: (): Promise<import('./ipc/types').HunterTestResult> =>
    ipcRenderer.invoke(IPC.SETTINGS_TEST_HUNTER),
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
  applyPlacesOfficialKey: (): Promise<PlacesOfficialIpcResult> =>
    ipcRenderer.invoke(IPC.PLACES_OFFICIAL_APPLY),
  refreshPlacesOfficialKey: (): Promise<PlacesOfficialIpcResult> =>
    ipcRenderer.invoke(IPC.PLACES_OFFICIAL_REFRESH),
  getOnboardingState: (): Promise<OnboardingState> =>
    ipcRenderer.invoke(IPC.ONBOARDING_GET_STATE),
  setOnboardingState: (patch: Partial<OnboardingState>): Promise<OnboardingState> =>
    ipcRenderer.invoke(IPC.ONBOARDING_SET_STATE, patch),
  getBusinessGuideState: (): Promise<BusinessGuideState> =>
    ipcRenderer.invoke(IPC.BUSINESS_GUIDE_GET),
  markBusinessGuide: (
    disposition: 'completed' | 'skipped',
  ): Promise<BusinessGuideState> =>
    ipcRenderer.invoke(IPC.BUSINESS_GUIDE_MARK, disposition),
  peekDefaultLanding: (): Promise<{ consumed: boolean }> =>
    ipcRenderer.invoke(IPC.DEFAULT_LANDING_PEEK),
  commitDefaultLanding: (): Promise<{ consumed: true }> =>
    ipcRenderer.invoke(IPC.DEFAULT_LANDING_COMMIT),
  probeEnvironment: (): Promise<EnvProbeResult> =>
    ipcRenderer.invoke(IPC.ONBOARDING_PROBE_ENV),
  installNode: (options?: { forceReinstall?: boolean }): Promise<NodeInstallResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_INSTALL_NODE, options),
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
  installOpenCode: (
    options?: { forceReinstall?: boolean },
  ): Promise<OpenCodeInstallResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_INSTALL_OPENCODE, options),
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
  installOfficeCli: (): Promise<OfficeCliInstallResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_INSTALL_OFFICECLI),
  onOfficeCliInstallProgress: (
    handler: (progress: OfficeCliInstallProgress) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: OfficeCliInstallProgress,
    ) => {
      handler(progress)
    }
    ipcRenderer.on(IPC.RUNTIME_INSTALL_OFFICECLI_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.RUNTIME_INSTALL_OFFICECLI_PROGRESS, listener)
    }
  },
  getOfficeCliReady: (): Promise<OfficeCliReadyResult> =>
    ipcRenderer.invoke(IPC.RUNTIME_OFFICECLI_READY),
  quitApp: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.APP_QUIT),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  saveTextToDownloads: (
    input: SaveTextToDownloadsInput,
  ): Promise<SaveTextToDownloadsResult> =>
    ipcRenderer.invoke(IPC.APP_SAVE_TEXT_TO_DOWNLOADS, input),
  checkForUpdate: (opts?: { forceNotify?: boolean }): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK, opts ?? {}),
  snoozeUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.UPDATE_SNOOZE),
  dismissUpdate: (version: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.UPDATE_DISMISS, version),
  getUpdateState: (): Promise<UpdateDownloadState> => ipcRenderer.invoke(IPC.UPDATE_STATE),
  onUpdateProgress: (handler: (state: UpdateDownloadState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateDownloadState) => {
      handler(state)
    }
    ipcRenderer.on(IPC.UPDATE_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, listener)
    }
  },
  onUpdateChecked: (handler: (result: UpdateCheckResult) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: UpdateCheckResult) => {
      handler(result)
    }
    ipcRenderer.on(IPC.UPDATE_CHECKED, listener)
    return () => {
      ipcRenderer.removeListener(IPC.UPDATE_CHECKED, listener)
    }
  },
  retryUpdateDownload: (): Promise<UpdateDownloadState> => ipcRenderer.invoke(IPC.UPDATE_RETRY),
  installUpdate: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  deferUpdate: (): Promise<UpdateDownloadState> => ipcRenderer.invoke(IPC.UPDATE_DEFER),
  setWorkflowNotifySuppressed: (suppressed: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.NOTIFY_SET_WORKFLOW_SUPPRESSED, suppressed),
  showTaskDoneNotification: (input: {
    ok: boolean
    body: string
  }): Promise<boolean> => ipcRenderer.invoke(IPC.NOTIFY_SHOW_TASK_DONE, input),
  listWorkflowSchedules: (): Promise<{
    ok: boolean
    schedules: import('./schedule/workflow-schedule-types').WorkflowSchedule[]
  }> => ipcRenderer.invoke(IPC.SCHEDULE_LIST),
  saveWorkflowSchedule: (
    input: import('./schedule/workflow-schedule-types').WorkflowScheduleSaveInput,
  ): Promise<
    | { ok: true; schedule: import('./schedule/workflow-schedule-types').WorkflowSchedule }
    | { ok: false; message: string }
  > => ipcRenderer.invoke(IPC.SCHEDULE_SAVE, input),
  deleteWorkflowSchedule: (
    id: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> =>
    ipcRenderer.invoke(IPC.SCHEDULE_DELETE, id),
  markWorkflowScheduleRun: (input: {
    scheduleId: string
    skipped?: boolean
    ok?: boolean
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SCHEDULE_MARK_RUN, input),
  onScheduleTrigger: (
    handler: (payload: {
      scheduleId: string
      productId: string
      planId: string
      reason: 'due'
    }) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        scheduleId: string
        productId: string
        planId: string
        reason: 'due'
      },
    ) => {
      handler(payload)
    }
    ipcRenderer.on(IPC.SCHEDULE_TRIGGER, listener)
    return () => {
      ipcRenderer.removeListener(IPC.SCHEDULE_TRIGGER, listener)
    }
  },
  saveSettings: (
    input: SettingsSaveInput,
  ): Promise<SettingsSaveResult & { status: AppStatus }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SAVE, input),
  setOpenAtLogin: (
    enabled: boolean,
  ): Promise<{ ok: boolean; openAtLogin: boolean }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_OPEN_AT_LOGIN, enabled),
  setCloseToTray: (
    enabled: boolean,
  ): Promise<{ ok: boolean; closeToTrayEnabled: boolean }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_CLOSE_TO_TRAY, enabled),
  setUiTheme: (
    mode: 'dark' | 'light' | 'system',
  ): Promise<{ ok: boolean; mode: string; effective: string }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_UI_THEME, mode),
  setExploreIntensity: (
    intensity: 'low' | 'medium' | 'high',
  ): Promise<{ ok: boolean; exploreIntensity: 'low' | 'medium' | 'high' }> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET_EXPLORE_INTENSITY, intensity),
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
  renameLibraryEntry: (relativePath: string, newName: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_RENAME, { relativePath, newName, cwd }),
  moveLibraryEntry: (relativePath: string, destDir: string, cwd = ''): Promise<LibraryMutationResult> =>
    ipcRenderer.invoke(IPC.LIBRARY_MOVE, { relativePath, destDir, cwd }),
  generateProfile: (input: ProfileGenerateInput): Promise<ProfileGenerateResult> =>
    ipcRenderer.invoke(IPC.PROFILE_GENERATE, input),
  abortProfile: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.PROFILE_ABORT),
  createAgentSession: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.AGENT_CREATE_SESSION),
  currentAgentSession: (): Promise<string | null> => ipcRenderer.invoke(IPC.AGENT_CURRENT_SESSION),
  sendAgentMessage: (text: string, productId?: string): Promise<SendFreeDialogueResult> =>
    ipcRenderer.invoke(IPC.AGENT_SEND_MESSAGE, text, productId),
  noteActiveProduct: (productId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.AGENT_NOTE_PRODUCT, productId),
  replyQuestion: (input: ReplyQuestionInput): Promise<ReplyQuestionResult> =>
    ipcRenderer.invoke(IPC.AGENT_REPLY_QUESTION, input),
  replyPermission: (reply: 'once' | 'reject'): Promise<ReplyPermissionResult> =>
    ipcRenderer.invoke(IPC.AGENT_REPLY_PERMISSION, reply),
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
  getExploreR2Sites: (): Promise<{
    ok: boolean
    sites: ExploreR2SiteDto[]
    message?: string
  }> => ipcRenderer.invoke(IPC.EXPLORATION_GET_R2_SITES),
  setExploreR2SiteEnabled: (
    siteId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean; sites: ExploreR2SiteDto[]; message?: string }> =>
    ipcRenderer.invoke(IPC.EXPLORATION_SET_R2_SITE_ENABLED, { siteId, enabled }),
  listWorkflowPlans: (): Promise<WorkflowListPlansResult> =>
    ipcRenderer.invoke(IPC.WORKFLOW_LIST_PLANS),
  saveWorkflowPlan: (input: WorkflowPlanSaveInput): Promise<WorkflowSavePlanResult> =>
    ipcRenderer.invoke(IPC.WORKFLOW_SAVE_PLAN, input),
  deleteWorkflowPlan: (id: string): Promise<WorkflowDeletePlanResult> =>
    ipcRenderer.invoke(IPC.WORKFLOW_DELETE_PLAN, id),
  listExploreTasks: (productId: string): Promise<ExploreTasksSnapshotDto> =>
    ipcRenderer.invoke(IPC.EXPLORATION_LIST_TASKS, productId),
  startExploreR1: (input: DiscoverLeadsInput): Promise<DiscoverLeadsResult> =>
    ipcRenderer.invoke(IPC.EXPLORATION_START_R1, input),
  startExploreR2: (input: DiscoverLeadsInput): Promise<DiscoverLeadsResult> =>
    ipcRenderer.invoke(IPC.EXPLORATION_START_R2, input),
  startExploreR3: (input: DiscoverLeadsInput): Promise<DiscoverLeadsResult> =>
    ipcRenderer.invoke(IPC.EXPLORATION_START_R3, input),
  listLeads: (productId: string): Promise<LeadsSnapshotDto> =>
    ipcRenderer.invoke(IPC.LEADS_LIST, productId),
  saveRawLead: (input: RawLeadSaveInput): Promise<RawLeadSaveResult> =>
    ipcRenderer.invoke(IPC.LEADS_SAVE_RAW, input),
  saveLeadIcebreak: (input: SaveLeadIcebreakInput): Promise<SaveLeadIcebreakResult> =>
    ipcRenderer.invoke(IPC.LEADS_SAVE_ICEBREAK, input),
  saveScoredPeople: (
    input: import('./ipc/types').SaveScoredPeopleInput,
  ): Promise<import('./ipc/types').SaveScoredPeopleResult> =>
    ipcRenderer.invoke(IPC.LEADS_SAVE_PEOPLE, input),
  verifyPersonEmail: (
    input: import('./ipc/types').VerifyPersonEmailInput,
  ): Promise<import('./ipc/types').VerifyPersonEmailResult> =>
    ipcRenderer.invoke(IPC.LEADS_VERIFY_PERSON_EMAIL, input),
  exportLeadsCsv: (input: ExportLeadsCsvInput): Promise<ExportLeadsCsvResult> =>
    ipcRenderer.invoke(IPC.LEADS_EXPORT_CSV, input),
  scoreAndDedupeLeads: (productId: string): Promise<ScoreAndDedupeResult> =>
    ipcRenderer.invoke(IPC.LEADS_SCORE_AND_DEDUPE, productId),
  listEmailDrafts: (
    productId: string,
    includeLeadId?: string,
  ): Promise<EmailDraftsSnapshotDto> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_LIST, productId, includeLeadId),
  getEmailDraftSlot: (input: GetEmailDraftSlotInput): Promise<EmailDraftSlotDetailDto> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_GET, input),
  saveEmailDraftSlot: (input: SaveEmailDraftSlotInput): Promise<SaveEmailDraftSlotResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_SAVE, input),
  getEmailRecipientPool: (
    input: GetEmailRecipientPoolInput,
  ): Promise<EmailRecipientPoolResultDto> =>
    ipcRenderer.invoke(IPC.EMAIL_RECIPIENT_POOL, input),
  draftEmails: (input: DraftEmailsInput): Promise<DraftEmailsResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_GENERATE, input),
  draftEmailSlot: (input: DraftEmailSlotInput): Promise<DraftEmailSlotResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_GENERATE_SLOT, input),
  generateEmailDraftZh: (
    input: GenerateEmailDraftZhInput,
  ): Promise<GenerateEmailDraftZhResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_GENERATE_ZH, input),
  enrichLeadContacts: (
    input: import('./ipc/types').EnrichLeadContactsInput,
  ): Promise<import('./ipc/types').EnrichLeadContactsResult> =>
    ipcRenderer.invoke(IPC.LEADS_ENRICH_CONTACTS, input),
  rejectEmailDraft: (input: RejectEmailDraftInput): Promise<RejectEmailDraftResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_REJECT, input),
  approveEmailDraft: (input: ApproveEmailDraftInput): Promise<ApproveEmailDraftResult> =>
    ipcRenderer.invoke(IPC.EMAIL_DRAFT_APPROVE, input),
  taskSnapshot: () => ipcRenderer.invoke(IPC.TASK_SNAPSHOT),
  launchWorkflowStep: (node: string, productId: string, origin: string) => ipcRenderer.invoke(IPC.WORKFLOW_LAUNCH_STEP, node, productId, origin),
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
