import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc/types'
import type {
  AppStatus,
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
  /** @deprecated 使用 restartOpenCode */
  restartSidecar: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  /** @deprecated 使用 getSidecarLogs */
  getSidecarLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
}

contextBridge.exposeInMainWorld('ftcs', api)

export type FtcsDesktopApi = typeof api
