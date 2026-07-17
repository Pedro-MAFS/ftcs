import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from './ipc/types'
import type {
  AgentEventPayload,
  AppStatus,
  ExploreTasksSnapshotDto,
  KeywordExpansionDto,
  KeywordsExpandResult,
  KeywordsSaveInput,
  KeywordsSaveResult,
  DiscoverLeadsInput,
  DiscoverLeadsResult,
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
} from './ipc/types'

const api = {
  platform: process.platform as NodeJS.Platform,
  getAppStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.APP_GET_STATUS),
  restartOpenCode: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  getOpenCodeLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
  getSettings: (): Promise<SettingsSnapshot> => ipcRenderer.invoke(IPC.SETTINGS_GET),
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
