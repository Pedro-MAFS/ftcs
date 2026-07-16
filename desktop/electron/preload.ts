import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from './ipc/types'
import type {
  AppStatus,
  LibraryMutationResult,
  LibrarySnapshot,
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
  restartSidecar: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  getSidecarLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
}

contextBridge.exposeInMainWorld('ftcs', api)

export type FtcsDesktopApi = typeof api
