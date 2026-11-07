export const app = {
  isPackaged: false,
  getPath() {
    return '/tmp/ftcs-electron-mock'
  },
  getVersion() {
    return '0.0.0-test'
  },
  on() {},
  once() {},
  quit() {},
}

export class BrowserWindow {}
export class Notification {
  static isSupported() {
    return false
  }
  on() {}
  show() {}
}
export const dialog = {}
export const shell = { openExternal() {} }
export const clipboard = {}
export const safeStorage = { isEncryptionAvailable() { return false } }
export const nativeTheme = { themeSource: 'dark', on() {}, shouldUseDarkColors: true }
export const ipcMain = { handle() {}, on() {} }
export const ipcRenderer = { invoke() {}, on() {}, removeListener() {} }
export const contextBridge = { exposeInMainWorld() {} }
export const webUtils = { getPathForFile() { return '' } }
export const net = {}
export const Menu = { buildFromTemplate() { return {} } }
export const Tray = class {}
export const nativeImage = { createFromPath() { return {} } }

export default { app }
