import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc/types'
import type { AppStatus } from './ipc/types'

const api = {
  platform: process.platform as NodeJS.Platform,
  getAppStatus: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.APP_GET_STATUS),
  restartOpenCode: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  getOpenCodeLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
  /** @deprecated 使用 restartOpenCode */
  restartSidecar: (): Promise<AppStatus> => ipcRenderer.invoke(IPC.OPENCODE_RESTART),
  /** @deprecated 使用 getSidecarLogs */
  getSidecarLogs: (): Promise<string[]> => ipcRenderer.invoke(IPC.OPENCODE_GET_LOGS),
}

contextBridge.exposeInMainWorld('ftcs', api)

export type FtcsDesktopApi = typeof api
