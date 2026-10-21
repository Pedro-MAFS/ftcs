import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BuiltinBrowserMode } from '../ipc/types'

interface CaptionState {
  mode: BuiltinBrowserMode
  title: string
  url: string
}

const api = {
  setMode(mode: BuiltinBrowserMode): void {
    void ipcRenderer.invoke(IPC.BUILTIN_BROWSER_SET_MODE, mode)
  },
  onState(callback: (state: CaptionState) => void): void {
    ipcRenderer.on(IPC.BUILTIN_BROWSER_CAPTION, (_event, state: CaptionState) => {
      callback(state)
    })
  },
}

contextBridge.exposeInMainWorld('ftcsCaption', api)

export type CaptionApi = typeof api
