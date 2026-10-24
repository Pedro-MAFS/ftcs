import { ipcMain, type BrowserWindow } from 'electron'
import { IPC, type BuiltinBrowserMode } from '../ipc/types'
import { DETAIL_UNREACHABLE, DETAIL_WINDOW_CLOSED, judgeBuiltinBrowserReady } from './readiness'
import {
  getBrowserUrl,
  readGatewayVersion,
  setBuiltinPageTargetId,
  startCdpGateway,
  stopCdpGateway,
  waitForBuiltinTarget,
} from './cdp-gateway'
import {
  destroyBuiltinBrowserWindow,
  ensureBuiltinBrowserWindow,
  getBuiltinBrowserMode,
  getBuiltinBrowserUiState,
  isBuiltinBrowserQuitting,
  isBuiltinWindowAlive,
  noteBuiltinBrowserQuitting,
  onBuiltinBrowserUi,
  setBuiltinBrowserMode,
  reinforceBuiltinBrowserViewport,
  showBuiltinBrowserFromTitleBar,
  showBuiltinBrowserInactive,
} from './builtin-browser-window'
import type { BuiltinBrowserStatus, BuiltinBrowserUiState } from './types'
import { isBuiltinBrowserMode, modeAfterEnsure } from './window-policy'

export {
  getBrowserUrl,
  noteBuiltinBrowserQuitting,
  setBuiltinBrowserMode,
  showBuiltinBrowserInactive,
}
export { installUnexpectedWebContentsGuard, allowCreatedWebContentsDuring } from './builtin-browser-window'
export { installRemoteDebuggingSwitch, reserveLoopbackPort } from './remote-debugging'
export { setInternalDebugPort } from './cdp-gateway'
export { judgeBuiltinBrowserReady } from './readiness'

let mainWindowGetter: () => BrowserWindow | null = () => null
let inflight: Promise<BuiltinBrowserStatus> | null = null
let lastStatus: BuiltinBrowserStatus = {
  ok: false,
  windowAlive: false,
  mode: modeAfterEnsure(),
  browserUrl: null,
  detail: DETAIL_WINDOW_CLOSED,
}

export function bindBuiltinBrowserMainWindow(getter: () => BrowserWindow | null): void {
  mainWindowGetter = getter
}

export function getBuiltinBrowserStatus(): BuiltinBrowserStatus {
  return {
    ...lastStatus,
    windowAlive: isBuiltinWindowAlive(),
    mode: getBuiltinBrowserMode(),
    browserUrl: getBrowserUrl(),
  }
}

export async function ensureBuiltinBrowser(): Promise<BuiltinBrowserStatus> {
  if (!inflight) {
    inflight = doEnsure().finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function doEnsure(): Promise<BuiltinBrowserStatus> {
  if (isBuiltinBrowserQuitting()) {
    return remember(false, DETAIL_WINDOW_CLOSED, '应用正在退出')
  }
  const main = mainWindowGetter()
  if (!main || main.isDestroyed()) {
    return remember(false, DETAIL_WINDOW_CLOSED, '主窗还没有')
  }
  try {
    await startCdpGateway()
  } catch (err) {
    return remember(false, DETAIL_UNREACHABLE, errorText(err))
  }
  try {
    await ensureBuiltinBrowserWindow(main)
  } catch (err) {
    if (!isBuiltinWindowAlive()) return remember(false, DETAIL_WINDOW_CLOSED, errorText(err))
    const judged = await judgedDetail()
    return remember(false, judged.detail, errorText(err))
  }
  const targetId = await waitForBuiltinTarget(3000)
  setBuiltinPageTargetId(targetId)
  if (targetId) await reinforceBuiltinBrowserViewport()
  if (!targetId) {
    const version = await readGatewayVersion(getBrowserUrl())
    const judged = judgeBuiltinBrowserReady({
      windowAlive: isBuiltinWindowAlive(),
      versionHttpStatus: null,
      webSocketDebuggerUrl: null,
    })
    return remember(false, judged.detail, `${version.diagnostic}；3 秒内未认到浏览页`)
  }
  const version = await readGatewayVersion(getBrowserUrl())
  const judged = judgeBuiltinBrowserReady({
    windowAlive: isBuiltinWindowAlive(),
    versionHttpStatus: version.status,
    webSocketDebuggerUrl: version.webSocketDebuggerUrl,
  })
  return remember(judged.status === 'ok', judged.detail, version.diagnostic)
}

async function judgedDetail(): Promise<{ detail: string }> {
  const version = await readGatewayVersion(getBrowserUrl())
  return judgeBuiltinBrowserReady({
    windowAlive: isBuiltinWindowAlive(),
    versionHttpStatus: version.status,
    webSocketDebuggerUrl: version.webSocketDebuggerUrl,
  })
}

function remember(ok: boolean, detail: string, diagnostic?: string): BuiltinBrowserStatus {
  lastStatus = {
    ok,
    windowAlive: isBuiltinWindowAlive(),
    mode: getBuiltinBrowserMode(),
    browserUrl: getBrowserUrl(),
    detail,
    diagnostic,
  }
  return lastStatus
}

export function registerBuiltinBrowserIpc(): void {
  onBuiltinBrowserUi((state) => {
    const main = mainWindowGetter()
    if (!main || main.isDestroyed()) return
    try {
      main.webContents.send(IPC.BUILTIN_BROWSER_STATE, state)
    } catch {
      // 主窗正在关
    }
  })
  ipcMain.handle(IPC.BUILTIN_BROWSER_GET_STATE, (): BuiltinBrowserUiState => getBuiltinBrowserUiState())
  ipcMain.handle(IPC.BUILTIN_BROWSER_SHOW, async () => {
    if (!isBuiltinWindowAlive()) await ensureBuiltinBrowser()
    await showBuiltinBrowserFromTitleBar()
    return getBuiltinBrowserUiState()
  })
  ipcMain.handle(IPC.BUILTIN_BROWSER_SET_MODE, async (_event, next: BuiltinBrowserMode) => {
    if (isBuiltinBrowserMode(next)) await setBuiltinBrowserMode(next)
    return getBuiltinBrowserUiState()
  })
}

export async function shutdownBuiltinBrowser(): Promise<void> {
  noteBuiltinBrowserQuitting()
  await stopCdpGateway()
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
