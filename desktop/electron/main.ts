import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDesktopEnvFile } from './config/load-desktop-env'
import { IPC } from './ipc/types'
import type { AppStatus } from './ipc/types'
import { getWorkspaceRoot } from './config/paths'
import { OpenCodeRuntime } from './opencode/runtime'
import {
  getSettingsSnapshot,
  pickWorkspaceDirectory,
  saveSettings,
  type SettingsSaveInput,
} from './settings/settings-service'
import { setTaskDoneNotifyMainWindowGetter } from './notify/task-done-notify'
import {
  detectSystemGoogleProxy,
  testGooglePlacesConnectivity,
} from './settings/places-connectivity'
import { testHunterConnectivity } from './settings/hunter-connectivity'
import {
  provisionOfficialChannel,
  refreshOfficialModels,
  refreshOfficialUsage,
  openOfficialRecharge,
  openOfficialPortal,
  maybeRefreshUsageAfterRechargeFocus,
} from './gateway/official-channel-service'
import { writeUserPrefs } from './config/user-prefs'
import { initializeWorkspace, ensureMcpServersReady } from './config/workspace-init'
import {
  addWebsite,
  createFolder,
  deleteFilesEntry,
  deleteWebsite,
  ensureLibraryDirs,
  importFilesFromPaths,
  listWebsites,
  moveFilesEntry,
  pasteClipboardFiles,
  pickAndImportFiles,
  pickAndImportFolders,
  renameFilesEntry,
} from './library/library-service'
import {
  flattenEntries,
  listFilesTree,
  nextFocusAfterDelete,
  resolveExistingFocusDir,
} from './library/library-tree'
import type {
  LibrarySnapshot,
  ProfileGenerateInput,
  ProfileSaveInput,
  KeywordsSaveInput,
  DiscoverLeadsInput,
  RawLeadSaveInput,
  ExportLeadsCsvInput,
  DraftEmailsInput,
  DraftEmailSlotInput,
  GenerateEmailDraftZhInput,
  RejectEmailDraftInput,
  ApproveEmailDraftInput,
  GetEmailDraftSlotInput,
  SaveEmailDraftSlotInput,
  GetEmailRecipientPoolInput,
} from './ipc/types'
import { AgentRunController } from './opencode/agent-runner'
import { bootstrapProductFromLibrary } from './profile/profile-bootstrap'
import { listProductSummaries, loadProfile } from './profile/profile-reader'
import { createEmptyDraftProfile, saveProductProfile, softDeleteProductProfile } from './profile/profile-writer'
import { loadExpansion, saveExpansion } from './keywords/keywords-reader'
import { listExploreTasks } from './exploration/explore-tasks'
import { listExploreR2Sites, setExploreR2SiteEnabled } from './exploration/r2-sites'
import {
  deleteUserWorkflowPlan,
  listWorkflowPlans,
  saveUserWorkflowPlan,
} from './workflow/workflow-plans'
import { listLeadsSnapshot } from './leads/leads-reader'
import { saveRawLead } from './leads/lead-writer'
import { saveScoredPeople } from './leads/save-scored-people'
import { verifyPersonEmail } from './leads/verify-person-email'
import { saveCsvWithDialog } from './leads/export-csv'
import { listEmailDraftsSnapshot, getEmailDraftSlot, getEmailRecipientPool } from './emails/emails-reader'
import { approveEmailDraft, rejectEmailDraft, saveEmailDraftSlot } from './emails/emails-writer'
import {
  runAgentPreflight,
  type AgentPreflightKind,
} from './preflight/agent-preflight'
import {
  cancelLogin,
  getAuthSession,
  logout as authLogout,
  openFeedback,
  setAuthSessionListener,
  startLogin,
} from './auth/oauth-service'
import {
  ackMessage,
  getInboxConfig,
  pullMessages,
} from './auth/inbox-service'
import type { InboxAnswer } from './auth/inbox-types'
import {
  getOnboardingState,
  patchOnboardingState,
  type OnboardingState,
} from './onboarding/onboarding-service'
import { probeEnvironment } from './onboarding/env-probe'
import { installNodeRuntime } from './runtime/install-node-portable-service'
import { installOpenCodeRuntime } from './runtime/install-opencode-binary-service'
import { installOfficeCliRuntime } from './runtime/install-officecli-service'
import {
  isOfficeCliInstallSupported,
  resolveConfiguredOfficeCli,
} from './runtime/officecli-paths'
import type {
  NodeInstallProgress,
  OpenCodeInstallProgress,
  OfficeCliInstallProgress,
} from './ipc/types'
import {
  checkForAppUpdate,
  dismissAppUpdate,
  getAppVersion,
  snoozeAppUpdate,
} from './update/update-check'

// 尽早加载 desktop/.env（electron-vite 不会把 FTCS_* 写入 process.env）
loadDesktopEnvFile()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 与前端 --bg-panel 一致，标题栏 / Overlay 共用 */
const TITLE_BAR_BG = '#1a1a1a'
const TITLE_BAR_FG = '#e4e4e4'
const TITLE_BAR_HEIGHT = 40

/**
 * Windows Server / 无独显环境常见 GpuControl.CreateCommandBuffer 报错，
 * 与 OpenCode Server 无关。须在 app ready 之前关闭硬件加速。
 */
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')

let mainWindow: BrowserWindow | null = null
let runtime: OpenCodeRuntime | null = null
let agentRunner: AgentRunController | null = null
/** Electron 不会 await before-quit；需要 preventDefault + 二次 quit */
let isCleaningUp = false

function getAgentRunner(): AgentRunController {
  if (!agentRunner) {
    agentRunner = new AgentRunController(() => runtime?.getClient() ?? null)
  }
  return agentRunner
}

function emitAgentEvent(
  sender: Electron.WebContents | null | undefined,
  payload: import('./ipc/types').AgentEventPayload,
): void {
  try {
    sender?.send(IPC.AGENT_EVENT, payload)
  } catch {
    // window closed
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== sender) {
    try {
      mainWindow.webContents.send(IPC.AGENT_EVENT, payload)
    } catch {
      // ignore
    }
  }
}

/** 与标题栏 LogoMark（蓝底 FT）一致的应用图标 */
function getAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png')
  }
  return path.join(__dirname, '../../build/icon.png')
}

function getWindowOptions(): BrowserWindowConstructorOptions {
  const iconPath = getAppIconPath()
  const options: BrowserWindowConstructorOptions = {
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    title: '外贸获客智能体',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }

  // 隐藏系统默认亮色标题条，改用暗色叠加控件（贴近 Cursor）
  if (process.platform === 'darwin') {
    options.titleBarStyle = 'hiddenInset'
    options.trafficLightPosition = { x: 16, y: 12 }
  } else {
    options.titleBarStyle = 'hidden'
    options.titleBarOverlay = {
      color: TITLE_BAR_BG,
      symbolColor: TITLE_BAR_FG,
      height: TITLE_BAR_HEIGHT,
    }
  }

  return options
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow(getWindowOptions())
  const win = mainWindow

  /**
   * Windows + titleBarOverlay：
   * - ready-to-show 可能丢失（electron#42409）
   * - loadURL resolve 后立刻 show 也常首帧未合成 → 黑屏（IPC/逻辑已在跑）
   * 策略：跳过过早的 ready-to-show；did-finish-load 后再延迟 show，并强制 DWM 重绘。
   */
  let shown = false
  const showOnce = (reason: string): void => {
    if (shown || win.isDestroyed()) return
    shown = true
    console.log('[window] show', reason)
    win.show()
    if (process.platform === 'win32') {
      forceWin32WindowPaint(win)
    }
  }

  if (process.platform !== 'win32') {
    win.once('ready-to-show', () => showOnce('ready-to-show'))
  }

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => showOnce('did-finish-load'), 80)
  })
  win.webContents.once('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load', { code, desc, url })
    showOnce('did-fail-load')
  })

  win.on('focus', () => {
    void maybeRefreshUsageAfterRechargeFocus()
  })

  setTaskDoneNotifyMainWindowGetter(() =>
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
  )

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  await loadRenderer(win)
  // 事件丢失时的兜底（勿在 load 瞬间立刻 show）
  setTimeout(() => showOnce('load-fallback'), 800)
}

/** Windows 自定义标题栏首启黑屏：用尺寸微扰 + 透明度触发合成 */
function forceWin32WindowPaint(win: BrowserWindow): void {
  try {
    win.setBackgroundColor('#141414')
    const [w, h] = win.getSize()
    win.setSize(w, h + 1)
    win.setSize(w, h)
    const prev = win.getOpacity()
    win.setOpacity(0.99)
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.setOpacity(prev > 0 ? prev : 1)
        win.focus()
      }
    }, 32)
  } catch (err) {
    console.warn('[window] forceWin32WindowPaint failed', err)
  }
}

/** 开发态 Vite 偶发未就绪时重试，避免首启白/黑屏、二次启动才正常 */
async function loadRenderer(win: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const attempts = 20
    for (let i = 0; i < attempts; i++) {
      try {
        await win.loadURL(devUrl)
        return
      } catch (err) {
        if (i === attempts - 1) {
          console.error('[window] loadURL failed:', err)
          throw err
        }
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    return
  }

  await win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function buildAppStatus(): Promise<AppStatus> {
  const opencode = runtime?.getStatus() ?? {
    state: 'idle' as const,
    mode: 'sdk-server-client' as const,
    port: 4096,
    baseUrl: 'http://127.0.0.1:4096',
  }

  const opencodeHealthy = runtime ? await runtime.healthCheck() : false
  const mcpServers = runtime ? await runtime.getMcpServers() : []

  return {
    workspaceRoot: getWorkspaceRoot(),
    opencode,
    sidecar: opencode,
    opencodeHealthy,
    mcpServers,
    agentRunning: getAgentRunner().isRunning(),
    devMode: !app.isPackaged,
    requiresLocalOpenCode: true,
  }
}

function buildLibrarySnapshot(focusDir = ''): LibrarySnapshot {
  const workspaceRoot = getWorkspaceRoot()
  ensureLibraryDirs(workspaceRoot)
  const { tree, truncated } = listFilesTree(workspaceRoot)
  const resolvedFocus = resolveExistingFocusDir(tree, focusDir)
  return {
    websites: listWebsites(workspaceRoot),
    focusDir: resolvedFocus,
    tree,
    truncated,
    filesRootLabel: 'data/library/files',
    cwd: resolvedFocus,
    entries: flattenEntries(tree),
  }
}

function libraryOk(message: string, cwd = '', extra?: Partial<{ imported: number; skipped: string[]; dirsCreated: number; createdPath: string }>) {
  return {
    ok: true,
    message,
    snapshot: buildLibrarySnapshot(cwd),
    ...extra,
  }
}

function libraryImportReply(
  dir: string,
  result: { imported: number; dirsCreated: number; skipped: string[] },
  emptyMessage: string,
  fileVerb: string,
) {
  const { imported, dirsCreated, skipped } = result
  if (imported === 0 && dirsCreated === 0 && skipped.length === 0) {
    return libraryOk('', dir, { imported: 0, dirsCreated: 0, skipped: [] })
  }
  const parts: string[] = []
  if (imported) parts.push(`${fileVerb} ${imported} 个文件`)
  if (dirsCreated) parts.push(`已创建 ${dirsCreated} 个文件夹`)
  if (skipped.length) parts.push(`跳过：${skipped.join('；')}`)
  const ok = imported > 0 || dirsCreated > 0
  return {
    ok,
    message: parts.join('。') || emptyMessage,
    snapshot: buildLibrarySnapshot(dir),
    imported,
    dirsCreated,
    skipped,
  }
}

function libraryFail(err: unknown, cwd = '') {
  return {
    ok: false,
    message: err instanceof Error ? err.message : String(err),
    snapshot: buildLibrarySnapshot(cwd),
  }
}

async function gateAgentStart(kind: AgentPreflightKind) {
  return runAgentPreflight(kind, {
    runtime,
    isAgentRunning: () => getAgentRunner().isRunning(),
  })
}

function broadcastAuthChanged(): void {
  const session = getAuthSession()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(IPC.AUTH_CHANGED, session)
      } catch {
        // ignore
      }
    }
  }
}

function registerIpcHandlers(): void {
  setAuthSessionListener(broadcastAuthChanged)
  ipcMain.handle(IPC.APP_GET_STATUS, async () => buildAppStatus())
  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    const raw = String(url || '').trim()
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return { ok: false, message: '无效的链接' }
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, message: '仅支持 http(s) 链接' }
    }
    await shell.openExternal(parsed.toString())
    return { ok: true, message: '已打开浏览器' }
  })
  ipcMain.handle(IPC.AUTH_GET_SESSION, () => getAuthSession())
  ipcMain.handle(IPC.AUTH_LOGIN, async () => {
    const result = await startLogin()
    broadcastAuthChanged()
    return result
  })
  ipcMain.handle(IPC.AUTH_CANCEL_LOGIN, async () => {
    const result = await cancelLogin()
    broadcastAuthChanged()
    return result
  })
  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    const result = await authLogout()
    broadcastAuthChanged()
    return result
  })
  ipcMain.handle(IPC.AUTH_OPEN_FEEDBACK, async () => {
    const result = await openFeedback()
    broadcastAuthChanged()
    return result
  })
  ipcMain.handle(IPC.INBOX_GET_CONFIG, () => getInboxConfig())
  ipcMain.handle(IPC.INBOX_PULL, async (_event, limit?: number) => {
    const n =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0
        ? Math.min(50, Math.floor(limit))
        : 20
    return pullMessages(n)
  })
  ipcMain.handle(
    IPC.INBOX_ACK,
    async (
      _event,
      input: { messageId?: string; answers?: InboxAnswer[] },
    ) => {
      return ackMessage(input?.messageId ?? '', input?.answers ?? [])
    },
  )
  ipcMain.handle(IPC.APP_AGENT_PREFLIGHT, async (_event, kind: AgentPreflightKind) => {
    try {
      return await gateAgentStart(kind)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        checks: [],
      }
    }
  })
  ipcMain.handle(IPC.OPENCODE_START, async () => {
    if (!runtime) {
      runtime = new OpenCodeRuntime()
    }
    await runtime.start()
    return {
      ok: runtime.getStatus().state === 'running',
      message:
        runtime.getStatus().state === 'running'
          ? 'OpenCode 已启动'
          : runtime.getStatus().error || '启动失败',
      status: await buildAppStatus(),
    }
  })
  ipcMain.handle(IPC.OPENCODE_STOP, async () => {
    if (!runtime) {
      return {
        ok: true,
        message: 'OpenCode 未运行',
        status: await buildAppStatus(),
      }
    }
    if (getAgentRunner().isRunning()) {
      await getAgentRunner().abortCurrent()
    }
    await runtime.stop()
    return {
      ok: true,
      message: 'OpenCode 已停止',
      status: await buildAppStatus(),
    }
  })
  ipcMain.handle(IPC.OPENCODE_RESTART, async () => {
    if (!runtime) {
      runtime = new OpenCodeRuntime()
    }
    if (getAgentRunner().isRunning()) {
      await getAgentRunner().abortCurrent()
    }
    await runtime.restart()
    return buildAppStatus()
  })
  ipcMain.handle(IPC.OPENCODE_GET_LOGS, () => runtime?.getLogs() ?? [])
  ipcMain.handle(IPC.OPENCODE_MCP_RECONNECT, async (_event, name: string) => {
    if (!runtime) {
      return {
        ok: false,
        message: 'OpenCode 未初始化',
        status: await buildAppStatus(),
      }
    }
    const result = await runtime.reconnectMcp(String(name || ''))
    return {
      ...result,
      status: await buildAppStatus(),
    }
  })

  ipcMain.handle(IPC.SETTINGS_GET, () => getSettingsSnapshot())
  ipcMain.handle(IPC.SETTINGS_DETECT_GOOGLE_PROXY, () => detectSystemGoogleProxy())
  ipcMain.handle(
    IPC.SETTINGS_TEST_GOOGLE_PLACES,
    async (
      _event,
      input?: {
        mode?: 'off' | 'system' | 'manual'
        manualProxyUrl?: string
      },
    ) => testGooglePlacesConnectivity(input),
  )
  ipcMain.handle(IPC.SETTINGS_TEST_HUNTER, async () => testHunterConnectivity())
  ipcMain.handle(IPC.ONBOARDING_GET_STATE, () => getOnboardingState())
  ipcMain.handle(
    IPC.ONBOARDING_SET_STATE,
    (_event, patch: Partial<OnboardingState>) => patchOnboardingState(patch ?? {}),
  )
  ipcMain.handle(IPC.ONBOARDING_PROBE_ENV, () => probeEnvironment())
  ipcMain.handle(
    IPC.RUNTIME_INSTALL_NODE,
    async (event, options?: { forceReinstall?: boolean }) => {
      return installNodeRuntime({
        forceReinstall: options?.forceReinstall,
        onProgress: (progress: NodeInstallProgress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC.RUNTIME_INSTALL_NODE_PROGRESS, progress)
          }
        },
      })
    },
  )
  ipcMain.handle(
    IPC.RUNTIME_INSTALL_OPENCODE,
    async (event, options?: { forceReinstall?: boolean }) => {
      return installOpenCodeRuntime({
        forceReinstall: options?.forceReinstall,
        onProgress: (progress: OpenCodeInstallProgress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC.RUNTIME_INSTALL_OPENCODE_PROGRESS, progress)
          }
        },
      })
    },
  )
  ipcMain.handle(IPC.RUNTIME_INSTALL_OFFICECLI, async (event) => {
    return installOfficeCliRuntime({
      onProgress: (progress: OfficeCliInstallProgress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.RUNTIME_INSTALL_OFFICECLI_PROGRESS, progress)
        }
      },
    })
  })
  ipcMain.handle(IPC.RUNTIME_OFFICECLI_READY, () => ({
    ready: resolveConfiguredOfficeCli() !== null,
    installSupported: isOfficeCliInstallSupported(),
  }))
  ipcMain.handle(IPC.APP_QUIT, () => {
    app.quit()
    return { ok: true }
  })
  ipcMain.handle(IPC.APP_GET_VERSION, () => getAppVersion())
  ipcMain.handle(IPC.UPDATE_CHECK, async (_event, opts?: { forceNotify?: boolean }) =>
    checkForAppUpdate({ forceNotify: Boolean(opts?.forceNotify) }),
  )
  ipcMain.handle(IPC.UPDATE_SNOOZE, () => {
    snoozeAppUpdate()
    return { ok: true }
  })
  ipcMain.handle(IPC.UPDATE_DISMISS, (_event, version: string) => {
    dismissAppUpdate(String(version || ''))
    return { ok: true }
  })
  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, input: SettingsSaveInput) => {
    const result = saveSettings(input)
    if (!runtime) {
      runtime = new OpenCodeRuntime()
    }
    await runtime.restart()
    return {
      ...result,
      status: await buildAppStatus(),
    }
  })
  ipcMain.handle(
    IPC.GATEWAY_PROVISION_OFFICIAL,
    async (_event, input?: { reset?: boolean }) => {
      const result = await provisionOfficialChannel({
        reset: Boolean(input?.reset),
      })
      if (result.ok) {
        if (!runtime) {
          runtime = new OpenCodeRuntime()
        }
        await runtime.restart()
      }
      return {
        ...result,
        status: await buildAppStatus(),
      }
    },
  )
  ipcMain.handle(IPC.GATEWAY_REFRESH_OFFICIAL_MODELS, async () => {
    const result = await refreshOfficialModels()
    return result
  })
  ipcMain.handle(IPC.GATEWAY_REFRESH_OFFICIAL_USAGE, async () => {
    const result = await refreshOfficialUsage()
    return result
  })
  ipcMain.handle(IPC.GATEWAY_OPEN_OFFICIAL_RECHARGE, async () => {
    return openOfficialRecharge()
  })
  ipcMain.handle(IPC.GATEWAY_OPEN_OFFICIAL_PORTAL, async () => {
    return openOfficialPortal()
  })
  ipcMain.handle(IPC.SETTINGS_PICK_WORKSPACE, async () => {
    const dir = await pickWorkspaceDirectory()
    if (!dir) return { path: null, restarted: false }

    const init = initializeWorkspace(dir, { forceManaged: true })
    writeUserPrefs({ workspaceRoot: dir })
    process.env.FTCS_WORKSPACE = dir

    // 新工作区通常需安装/构建 MCP 依赖
    await ensureMcpServersReady(dir)

    if (!runtime) {
      runtime = new OpenCodeRuntime()
    }
    await runtime.restart()
    return {
      path: dir,
      restarted: true,
      init,
      settings: getSettingsSnapshot(),
      status: await buildAppStatus(),
    }
  })

  ipcMain.handle(IPC.LIBRARY_LIST, (_event, cwd?: string) => buildLibrarySnapshot(cwd ?? ''))

  ipcMain.handle(IPC.LIBRARY_ADD_WEBSITE, (_event, url: string, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const created = addWebsite(url, dir)
      return libraryOk('已保存公司网站', dir, { createdPath: created.relativePath })
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(IPC.LIBRARY_DELETE_WEBSITE, (_event, relativePath: string, cwd?: string) => {
    try {
      deleteWebsite(relativePath)
      return libraryOk('已删除网站', cwd ?? '')
    } catch (err) {
      return libraryFail(err, cwd ?? '')
    }
  })

  ipcMain.handle(IPC.LIBRARY_LIST_DIR, (_event, cwd?: string) => {
    try {
      return { ok: true, message: '', snapshot: buildLibrarySnapshot(cwd ?? '') }
    } catch (err) {
      return libraryFail(err, '')
    }
  })

  ipcMain.handle(
    IPC.LIBRARY_MKDIR,
    (_event, payload: { cwd?: string; name: string }) => {
      const cwd = payload.cwd ?? ''
      try {
        const created = createFolder(cwd, payload.name)
        return libraryOk('已创建目录', created.relativePath)
      } catch (err) {
        return libraryFail(err, cwd)
      }
    },
  )

  ipcMain.handle(IPC.LIBRARY_UPLOAD_FILES, async (_event, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const result = await pickAndImportFiles(dir, mainWindow)
      return libraryImportReply(dir, result, '', '已导入')
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(
    IPC.LIBRARY_IMPORT_PATHS,
    (_event, payload: { cwd?: string; paths: string[] }) => {
      const dir = payload.cwd ?? ''
      try {
        const result = importFilesFromPaths(dir, payload.paths ?? [])
        return libraryImportReply(dir, result, '没有可导入的文件', '已粘贴/导入')
      } catch (err) {
        return libraryFail(err, dir)
      }
    },
  )

  ipcMain.handle(IPC.LIBRARY_IMPORT_FOLDERS, async (_event, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const result = await pickAndImportFolders(dir, mainWindow)
      return libraryImportReply(dir, result, '', '已导入')
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(IPC.LIBRARY_PASTE_CLIPBOARD, (_event, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const result = pasteClipboardFiles(dir)
      if (result.imported === 0 && result.dirsCreated === 0) {
        return {
          ok: false,
          message: result.skipped[0] || '剪贴板中没有可粘贴的文件',
          snapshot: buildLibrarySnapshot(dir),
          imported: 0,
          dirsCreated: 0,
          skipped: result.skipped,
        }
      }
      return libraryImportReply(dir, result, '', '已粘贴')
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(
    IPC.LIBRARY_DELETE_ENTRY,
    (_event, payload: { relativePath: string; cwd?: string }) => {
      const cwd = payload.cwd ?? ''
      try {
        const nextFocus = nextFocusAfterDelete(payload.relativePath, cwd)
        deleteFilesEntry(payload.relativePath)
        return libraryOk('已删除', nextFocus)
      } catch (err) {
        return libraryFail(err, cwd)
      }
    },
  )

  ipcMain.handle(
    IPC.LIBRARY_RENAME,
    (_event, payload: { relativePath: string; newName: string; cwd?: string }) => {
      const cwd = payload.cwd ?? ''
      try {
        const result = renameFilesEntry(payload.relativePath, payload.newName)
        const message = result.changed ? '已重命名' : '名称未变化'
        return libraryOk(message, result.focusDir, { createdPath: result.relativePath })
      } catch (err) {
        return libraryFail(err, cwd)
      }
    },
  )

  ipcMain.handle(
    IPC.LIBRARY_MOVE,
    (_event, payload: { relativePath: string; destDir: string; cwd?: string }) => {
      const cwd = payload.cwd ?? ''
      try {
        const result = moveFilesEntry(payload.relativePath, payload.destDir)
        const message = result.changed ? '已移动' : '已在该文件夹中'
        return libraryOk(message, result.focusDir, { createdPath: result.relativePath })
      } catch (err) {
        return libraryFail(err, cwd)
      }
    },
  )

  ipcMain.handle(IPC.PROFILE_LIST, () => listProductSummaries())

  ipcMain.handle(IPC.PROFILE_GET, (_event, productId: string) => {
    if (!productId) return null
    return loadProfile(productId)
  })

  ipcMain.handle(IPC.PROFILE_SAVE, (_event, input: ProfileSaveInput) => {
    try {
      return saveProductProfile(input)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.PROFILE_DELETE, (_event, productId: string) => {
    try {
      return softDeleteProductProfile(productId)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.PROFILE_CREATE_DRAFT, () => {
    try {
      return createEmptyDraftProfile()
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.KEYWORDS_GET, (_event, productId: string) => {
    try {
      return loadExpansion(productId)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.KEYWORDS_SAVE, (_event, input: KeywordsSaveInput) => {
    try {
      return saveExpansion(input)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EXPLORATION_GET_R2_SITES, () => {
    try {
      return { ok: true as const, sites: listExploreR2Sites(getWorkspaceRoot()) }
    } catch (err) {
      return {
        ok: false as const,
        sites: [],
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(
    IPC.EXPLORATION_SET_R2_SITE_ENABLED,
    (_event, input: { siteId: string; enabled: boolean }) => {
      try {
        const siteId = String(input?.siteId || '').trim()
        if (!siteId) {
          return { ok: false as const, sites: [], message: '缺少站点 id' }
        }
        const sites = setExploreR2SiteEnabled(getWorkspaceRoot(), siteId, Boolean(input.enabled))
        return { ok: true as const, sites }
      } catch (err) {
        return {
          ok: false as const,
          sites: listExploreR2Sites(getWorkspaceRoot()),
          message: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  ipcMain.handle(IPC.WORKFLOW_LIST_PLANS, () => {
    try {
      return { ok: true as const, plans: listWorkflowPlans(getWorkspaceRoot()) }
    } catch (err) {
      return {
        ok: false as const,
        plans: [],
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.WORKFLOW_SAVE_PLAN, (_event, input) => {
    try {
      const plan = saveUserWorkflowPlan(getWorkspaceRoot(), input)
      return { ok: true as const, plan }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.WORKFLOW_DELETE_PLAN, (_event, id: string) => {
    try {
      deleteUserWorkflowPlan(getWorkspaceRoot(), String(id || ''))
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EXPLORATION_LIST_TASKS, (_event, productId: string) => {
    try {
      const profile = loadProfile(productId)
      return listExploreTasks(productId, {
        companyName: profile?.companyName,
      })
    } catch (err) {
      return {
        productId,
        tasks: [],
        summary: {
          total: 0,
          keywordsReady: 0,
          running: 0,
          completed: 0,
          failed: 0,
        },
        expansion: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_LIST, (_event, productId: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return {
          productId: '',
          rows: [],
          stats: {
            total: 0,
            raw: 0,
            scored: 0,
            discarded: 0,
            byTier: { high: 0, medium: 0, low: 0 },
            pendingMail: 0,
          },
        }
      }
      return listLeadsSnapshot(productId)
    } catch (err) {
      return {
        productId,
        rows: [],
        stats: {
          total: 0,
          raw: 0,
          scored: 0,
          discarded: 0,
          byTier: { high: 0, medium: 0, low: 0 },
          pendingMail: 0,
        },
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_SAVE_RAW, (_event, input: RawLeadSaveInput) => {
    try {
      return saveRawLead(input)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_SAVE_PEOPLE, (_event, input) => {
    try {
      return saveScoredPeople(input)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_VERIFY_PERSON_EMAIL, async (_event, input) => {
    try {
      return await verifyPersonEmail(input)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_EXPORT_CSV, async (_event, input: ExportLeadsCsvInput) => {
    try {
      return await saveCsvWithDialog(input ?? { content: '', defaultFileName: '' }, mainWindow)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.KEYWORDS_EXPAND, async (event, productId: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('expand-keywords')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runExpandKeywords(productId, (payload) => emitAgentEvent(sender, payload))
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为 ${productId} 扩展关键词…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.LEADS_SCORE_AND_DEDUPE, async (event, productId: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('score-and-dedupe')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runScoreAndDedupe(productId, (payload) => emitAgentEvent(sender, payload))
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为 ${productId} 评分去重…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(
    IPC.LEADS_ENRICH_CONTACTS,
    async (
      event,
      input: {
        productId?: string
        leadId?: string
        leadIds?: string[]
        verifyEmails?: boolean
      },
    ) => {
      try {
        const productId = input?.productId
        if (!productId || typeof productId !== 'string') {
          return { ok: false, message: '缺少 productId' }
        }
        const leadIds = Array.isArray(input?.leadIds)
          ? input.leadIds.filter((id) => typeof id === 'string' && id.trim())
          : []
        const leadId =
          typeof input?.leadId === 'string' && input.leadId.trim()
            ? input.leadId.trim()
            : ''
        const preflight = await gateAgentStart('enrich-lead-contacts')
        if (!preflight.ok) {
          return { ok: false, message: preflight.message }
        }

        const verifyEmails = getSettingsSnapshot().hunterVerifyEmails
        const sender = event.sender
        const targets = leadIds.length > 0 ? leadIds : leadId ? [leadId] : undefined
        void getAgentRunner()
          .enrichLeadContacts(
            {
              productId,
              leadIds: targets,
              verifyEmails,
            },
            (payload) => emitAgentEvent(sender, payload),
          )
          .catch((err) => {
            emitAgentEvent(sender, {
              type: 'done',
              ok: false,
              productId,
              message: err instanceof Error ? err.message : String(err),
            })
          })

        const scope =
          targets && targets.length === 1
            ? targets[0]
            : targets && targets.length > 1
              ? `${targets.length} 条线索`
              : '全部待补全线索'
        return {
          ok: true,
          message: `正在为 ${scope} 补全联系人${verifyEmails ? '（含验邮）' : ''}…`,
          productId,
          leadId: targets?.length === 1 ? targets[0] : undefined,
          leadIds: targets,
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  ipcMain.handle(IPC.EMAIL_DRAFT_LIST, (_event, productId: string, includeLeadId?: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return {
          productId: '',
          drafts: [],
          pendingHighLeadIds: [],
          stats: { total: 0, pendingReview: 0, pendingHigh: 0 },
        }
      }
      return listEmailDraftsSnapshot(productId, undefined, {
        includeLeadId: typeof includeLeadId === 'string' ? includeLeadId : undefined,
      })
    } catch (err) {
      return {
        productId,
        drafts: [],
        pendingHighLeadIds: [],
        stats: { total: 0, pendingReview: 0, pendingHigh: 0 },
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_GET, (_event, input: GetEmailDraftSlotInput) => {
    try {
      return getEmailDraftSlot(input.productId, input.leadId, input.recipientKey)
    } catch (err) {
      return {
        ok: false,
        exists: false,
        message: err instanceof Error ? err.message : String(err),
        productId: input?.productId ?? '',
        leadId: input?.leadId ?? '',
        recipientKey: input?.recipientKey ?? 'company',
        audience: 'company' as const,
        email: '',
        name: '',
        recipientAliases: [],
        status: '',
        language: 'en',
        subject: '',
        body: '',
        subjectZh: null,
        bodyZh: null,
        zhStale: false,
        stylePrompt: null,
        personalizationEvidence: [],
        draftPath: '',
        companyName: '',
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_SAVE, (_event, input: SaveEmailDraftSlotInput) => {
    try {
      return saveEmailDraftSlot(input, getWorkspaceRoot())
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_RECIPIENT_POOL, (_event, input: GetEmailRecipientPoolInput) => {
    try {
      return getEmailRecipientPool(input.productId, input.leadId)
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        productId: input?.productId ?? '',
        leadId: input?.leadId ?? '',
        companyName: '',
        tier: '',
        leadStatus: '',
        score: null,
        pool: [],
        defaultRecipientKey: 'company',
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_REJECT, (_event, input: RejectEmailDraftInput) => {
    try {
      return rejectEmailDraft(input, getWorkspaceRoot())
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_APPROVE, (_event, input: ApproveEmailDraftInput) => {
    try {
      return approveEmailDraft(input, getWorkspaceRoot())
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_GENERATE, async (event, input: DraftEmailsInput) => {
    try {
      const productId = input?.productId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('draft-email')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const leadIds = Array.isArray(input.leadIds)
        ? input.leadIds.filter((id) => typeof id === 'string' && id.trim())
        : undefined

      const sender = event.sender
      void getAgentRunner()
        .runDraftOutreachEmail(
          productId,
          (payload) => emitAgentEvent(sender, payload),
          { leadIds },
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      const scope =
        leadIds && leadIds.length > 0
          ? `${leadIds.length} 条指定线索`
          : '全部待起草已评分线索'
      return {
        ok: true,
        message: `正在为 ${productId} 起草开发信（${scope}）…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_GENERATE_SLOT, async (event, input: DraftEmailSlotInput) => {
    try {
      const productId = input?.productId
      const leadId = input?.leadId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      if (!leadId || typeof leadId !== 'string') {
        return { ok: false, message: '缺少 leadId' }
      }
      const audience = input.audience === 'person' ? 'person' : 'company'
      const preflight = await gateAgentStart('draft-email')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runDraftOutreachEmailSlot(
          {
            productId,
            leadId,
            audience,
            email: typeof input.email === 'string' ? input.email : undefined,
            recipientKey:
              typeof input.recipientKey === 'string' ? input.recipientKey : undefined,
          },
          (payload) => emitAgentEvent(sender, payload),
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为线索 ${leadId} 起草/重写当前收件人开发信…`,
        productId,
        leadId,
        recipientKey: input.recipientKey || (audience === 'company' ? 'company' : undefined),
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EMAIL_DRAFT_GENERATE_ZH, async (event, input: GenerateEmailDraftZhInput) => {
    try {
      const productId = input?.productId
      const leadId = input?.leadId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      if (!leadId || typeof leadId !== 'string') {
        return { ok: false, message: '缺少 leadId' }
      }
      const recipientKey =
        typeof input.recipientKey === 'string' && input.recipientKey.trim()
          ? input.recipientKey.trim()
          : 'company'
      const preflight = await gateAgentStart('draft-email')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runTranslateOutreachEmail(
          { productId, leadId, recipientKey },
          (payload) => emitAgentEvent(sender, payload),
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在生成中文对照…`,
        productId,
        leadId,
        recipientKey,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EXPLORATION_START_R1, async (event, input: DiscoverLeadsInput) => {
    try {
      const productId = input?.productId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('discover-leads')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runDiscoverLeads(
          productId,
          (payload) => emitAgentEvent(sender, payload),
          {
            channel: 'r1',
            maxQueries: input.maxQueries,
          },
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为 ${productId} 启动 R1 探索…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EXPLORATION_START_R2, async (event, input: DiscoverLeadsInput) => {
    try {
      const productId = input?.productId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('discover-leads-r2')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runDiscoverLeads(
          productId,
          (payload) => emitAgentEvent(sender, payload),
          {
            channel: 'r2',
            maxQueries: input.maxQueries,
          },
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为 ${productId} 启动 R2 社媒发现…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.EXPLORATION_START_R3, async (event, input: DiscoverLeadsInput) => {
    try {
      const productId = input?.productId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      const preflight = await gateAgentStart('discover-leads-r3')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const sender = event.sender
      void getAgentRunner()
        .runDiscoverLeads(
          productId,
          (payload) => emitAgentEvent(sender, payload),
          {
            channel: 'r3',
            maxQueries: input.maxQueries,
          },
        )
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `正在为 ${productId} 启动 R3 地图发现…`,
        productId,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC.PROFILE_ABORT, async () => {
    await getAgentRunner().abortCurrent()
    return { ok: true }
  })

  ipcMain.handle(IPC.PROFILE_GENERATE, async (event, input: ProfileGenerateInput) => {
    try {
      const preflight = await gateAgentStart('extract-profile')
      if (!preflight.ok) {
        return { ok: false, message: preflight.message }
      }

      const bootstrap = await bootstrapProductFromLibrary({
        websitePaths: input?.websitePaths ?? [],
        filePaths: input?.filePaths ?? [],
      })

      const sender = event.sender
      void getAgentRunner()
        .runExtractProfile(bootstrap, (payload) => emitAgentEvent(sender, payload))
        .catch((err) => {
          emitAgentEvent(sender, {
            type: 'done',
            ok: false,
            productId: bootstrap.productId,
            message: err instanceof Error ? err.message : String(err),
          })
        })

      return {
        ok: true,
        message: `已分配 ${bootstrap.productId}，正在生成画像…`,
        productId: bootstrap.productId,
        skipped: bootstrap.skipped,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

async function bootstrapOpenCode(): Promise<void> {
  runtime = new OpenCodeRuntime()
  try {
    await runtime.start()
  } catch (err) {
    // start() 内部已落状态；此处再兜底，避免挡住窗口
    console.error('[opencode] bootstrap failed:', err)
  }
}

app.whenReady().then(async () => {
  // 强制暗色系统主题，避免 Windows 原生控件/菜单仍为浅色
  nativeTheme.themeSource = 'dark'
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ftcs.desktop')
  }

  registerIpcHandlers()

  // 先开窗口，再启 OpenCode，避免 Server 失败时界面空白，也避免 GPU 日志被误认为 Server 阻塞
  await createWindow()
  void bootstrapOpenCode()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 修复残留 opencode：Electron 的 before-quit 不会等待 async。
 * 必须先 preventDefault，等 stop() 完成（含 taskkill）再真正退出。
 */
app.on('before-quit', (event) => {
  if (isCleaningUp) return
  event.preventDefault()
  isCleaningUp = true

  void (async () => {
    try {
      await runtime?.stop()
    } catch (err) {
      console.error('[opencode] cleanup on quit failed:', err)
    } finally {
      app.exit(0)
    }
  })()
})
