import { getCloudflareState, connectCloudflare, disconnectCloudflare, cancelCloudflareAuth, selectCloudflareAccount, getCloudflareCredentials } from './cloudflare/cloudflare-auth'
import { CloudflarePages, verifyPagesProject, type PagesProject } from './cloudflare/cloudflare-pages'
import { getGithubState, startGithubAuth, pollGithubAuth, cancelGithubAuth, disconnectGithub, getGithubAccessToken } from './github/github-auth'
import { GithubRepositories } from './github/github-repositories'
import { adoptSite, createSite, getSiteOutput, getSiteSnapshot } from './site/site-project'
import { SitePublish, readRelease, type ReleaseRecord } from './site/site-publish'
import { SiteDeployment } from './site/site-deployment'
import { SiteRuntime, type RunKind } from './site/site-runtime'
import { resolveConfiguredNode } from './runtime/node-paths'
import { resolveBestNode } from './runtime/resolve-node'
import { openSitePreviewTab } from './browser-runtime/builtin-browser-window'
import { clearVerifiedPreviewTargets } from './browser-runtime/cdp-filter'
import { markExplorationRunFailed } from './exploration/exploration-writer'
import { TaskJournal } from './tasks/journal'
import type { TaskSkill } from './tasks/lifecycle'
import { recipientKeyFromEmail as slotKeyForEmail } from './emails/emails-reader'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDesktopEnvFile } from './config/load-desktop-env'
import { IPC } from './ipc/types'
import type { AppStatus, SaveTextToDownloadsInput } from './ipc/types'
import { saveTextToDownloads } from './session/save-text-to-downloads'
import { getRepoRoot, getWorkspaceRoot } from './config/paths'
import { OpenCodeRuntime } from './opencode/runtime'
import {
  getSettingsSnapshot,
  pickWorkspaceDirectory,
  saveSettings,
  type SettingsSaveInput,
} from './settings/settings-service'
import {
  onMainWindowBackgrounded,
  setTaskDoneNotifyMainWindowGetter,
  setWorkflowNotifySuppressed,
  showTaskDoneNotification,
} from './notify/task-done-notify'
import { formatTaskDoneNotifyBody, taskLabelForNotify } from './notify/task-done-notify-body'
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
import {
  applyPlacesOfficialKey,
  refreshPlacesOfficialKey,
  releasePlacesDiscoverRun,
  resolvePlacesApiKeyForConnectivityTest,
} from './gateway/places-official-runtime'
import { placesOfficialKeyMemory } from './gateway/places-official-key-memory'
import { setPlacesMcpInjection } from './opencode/places-mcp-env'
import { writeUserPrefs, readUserPrefs } from './config/user-prefs'
import { storedMainViewLayout, writableMainViewLayout } from './config/main-view-layout'
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
import { AgentRunController, capDraftOutreachLeadIds } from './opencode/agent-runner'
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
import { saveLeadIcebreak, saveRawLead } from './leads/lead-writer'
import { saveScoredPeople } from './leads/save-scored-people'
import { verifyPersonEmail } from './leads/verify-person-email'
import { saveCsvWithDialog } from './leads/export-csv'
import {
  getEmailDraftSlot,
  getEmailRecipientPool,
  listEmailDraftsSnapshot,
  listLeadsNeedingDraft,
} from './emails/emails-reader'
import { approveEmailDraft, rejectEmailDraft, saveEmailDraftSlot } from './emails/emails-writer'
import {
  runAgentPreflight,
  type AgentPreflightKind,
} from './preflight/agent-preflight'
import type { AgentPreflightOptions } from './ipc/types'
import {
  allowCreatedWebContentsDuring,
  bindBuiltinBrowserMainWindow,
  ensureBuiltinBrowser,
  installBuiltinBrowserBackgroundSwitches,
  installRemoteDebuggingSwitch,
  installUnexpectedWebContentsGuard,
  noteBuiltinBrowserQuitting,
  registerBuiltinBrowserIpc,
  reserveLoopbackPort,
  setInternalDebugPort,
  shutdownBuiltinBrowser,
} from './browser-runtime/index'
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
import {
  getBusinessGuideState,
  markBusinessGuide,
} from './onboarding/business-guide-service'
import {
  commitDefaultLanding,
  peekDefaultLanding,
} from './default-landing'
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
  type UpdateCheckResult,
} from './update/update-check'
import { delayUntilNextUpdateCheck } from './update/update-schedule'
import {
  bindUpdateDownloadBroadcast,
  deferUpdateInstall,
  getUpdateDownloadState,
  installDownloadedUpdate,
  retryUpdateDownload,
} from './update/update-download'
import { createAppTray, destroyAppTray, showMainWindow } from './tray/app-tray'
import {
  applyCloseToTrayEnabled,
  isCloseToTrayEnabled,
} from './tray/close-to-tray'
import {
  applyOpenAtLogin,
  shouldStartHidden,
  syncOpenAtLoginFromPrefs,
} from './login/login-item'
import {
  deleteWorkflowSchedule,
  listWorkflowSchedules,
  saveWorkflowSchedule,
} from './schedule/workflow-schedules'
import {
  handleScheduleRunResult,
  startWorkflowScheduler,
  stopWorkflowScheduler,
} from './schedule/workflow-scheduler'
import {
  applyUiThemeMode,
  bootstrapUiThemeFromPrefs,
  getStoredUiThemeMode,
  getTitleBarColors,
  type UiThemeMode,
} from './theme/ui-theme'
import { applyExploreIntensity } from './explore/explore-intensity'
import { installConsoleLogging } from './logging/console-log'

const desktopLog = installConsoleLogging(path.join(app.getPath('userData'), 'logs'))

// 尽早加载 desktop/.env（electron-vite 不会把 FTCS_* 写入 process.env）
loadDesktopEnvFile()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 与前端 --bg-panel / --text 一致，随主题切换 */
const TITLE_BAR_HEIGHT = 40

function currentTitleBar(): { bg: string; fg: string; windowBg: string } {
  return getTitleBarColors(getStoredUiThemeMode())
}

/**
 * Windows Server / 无独显环境常见 GpuControl.CreateCommandBuffer 报错，
 * 与 OpenCode Server 无关。须在 app ready 之前关闭硬件加速。
 */
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
installBuiltinBrowserBackgroundSwitches()

try {
  const internalDebugPort = await reserveLoopbackPort()
  installRemoteDebuggingSwitch(internalDebugPort)
  setInternalDebugPort(internalDebugPort)
} catch (err) {
  console.error('[builtin-browser] 内部调试端口没有绑上', err)
}

let mainWindow: BrowserWindow | null = null
const siteRuntime = new SiteRuntime(resolveConfiguredNode, getWorkspaceRoot, snapshot => {
  if (snapshot.preview.state !== 'running') clearVerifiedPreviewTargets()
  broadcastToWindows(IPC.SITE_RUNTIME_EVENT, snapshot)
}, async () => (await resolveBestNode()).bestOk)
const githubRepositories = new GithubRepositories(getGithubAccessToken)
const sitePublish = new SitePublish(githubRepositories, async () => resolveConfiguredNode() ?? (await resolveBestNode()).bestOk, getWorkspaceRoot)
const pages = new CloudflarePages(getCloudflareCredentials)
let pagesCreationInFlight = false
let sitePreviewTab: string | undefined
let runtime: OpenCodeRuntime | null = null
let agentRunner: AgentRunController | null = null
/** Electron 不会 await before-quit；需要 preventDefault + 二次 quit */
let isCleaningUp = false
/** 托盘「退出」或真正退出时为 true，此时允许窗口 close 销毁 */
let isQuitting = false
/** 登录自启 / --hidden：创建后不强制 show */
let startHidden = false

async function reloadOpenCodeRuntime(): Promise<void> {
  if (!runtime) runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
  await runtime.restart()
}

function getAgentRunner(): AgentRunController {
  if (!agentRunner) {
    agentRunner = new AgentRunController(() => runtime?.getClient() ?? null, {
      reloadRuntime: reloadOpenCodeRuntime,
      preflight: (kind, options) => runAgentPreflight(kind, { runtime, isAgentRunning: () => false }, options),
      refreshPlaces: () => runtime ? runtime.refreshPlacesMcp() : Promise.reject(new Error('服务未就绪')),
      lifecycle: true,
    })
  }
  return agentRunner
}

let taskJournal: { root: string; journal: TaskJournal } | undefined
function getTaskJournal() {
  const root = getWorkspaceRoot()
  if (taskJournal?.root !== root) {
    const journal = new TaskJournal(root, task => {
      if (task.scope.product_id && task.run_id) markExplorationRunFailed(task.scope.product_id, task.run_id, task.message, root)
    })
    taskJournal = { root, journal }
  }
  return taskJournal.journal
}

function emitAgentEvent(
  sender: Electron.WebContents | null | undefined,
  payload: import('./ipc/types').AgentEventPayload,
): void {
  try {
    if (payload.type === 'task.changed') {
      const task = payload.task
      getTaskJournal().record(task)
      if (task.finished_at) showTaskDoneNotification({
        ok: task.state === 'succeeded',
        body: task.state === 'partial' || task.state === 'interrupted'
          ? `${taskLabelForNotify(task.task_type, task.message)}${task.state === 'partial' ? '部分完成' : '已中断'}`
          : formatTaskDoneNotifyBody({ skill: task.task_type, ok: task.state === 'succeeded', message: task.message }),
      })
    }
  } catch (err) {
    console.warn('[ftcs:notify] done hook error', err)
    // 通知失败不得阻断 IPC
  }

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
  const chrome = currentTitleBar()
  const options: BrowserWindowConstructorOptions = {
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: chrome.windowBg,
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
      color: chrome.bg,
      symbolColor: chrome.fg,
      height: TITLE_BAR_HEIGHT,
    }
  }

  return options
}

async function createWindow(): Promise<void> {
  mainWindow = allowCreatedWebContentsDuring(() => new BrowserWindow(getWindowOptions()))
  const win = mainWindow
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error']
    desktopLog.write('renderer', levels[level] ?? 'log', `${message} (${sourceId}:${line})`)
  })

  /**
   * Windows + titleBarOverlay：
   * - ready-to-show 可能丢失（electron#42409）
   * - loadURL resolve 后立刻 show 也常首帧未合成 → 黑屏（IPC/逻辑已在跑）
   * 策略：跳过过早的 ready-to-show；did-finish-load 后再延迟 show，并强制 DWM 重绘。
   */
  let shown = false
  const showOnce = (reason: string): void => {
    if (shown || win.isDestroyed()) return
    if (startHidden) {
      shown = true
      console.log('[window] keep hidden (tray / login)', reason)
      return
    }
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

  win.on('blur', () => {
    onMainWindowBackgrounded()
  })
  win.on('minimize', () => {
    onMainWindowBackgrounded()
  })

  win.on('close', (event) => {
    if (isQuitting) return
    if (isCloseToTrayEnabled()) {
      event.preventDefault()
      win.hide()
      return
    }
    // 未开启「关闭进托盘」：允许销毁并走 before-quit 清理
    isQuitting = true
    noteBuiltinBrowserQuitting()
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
    const chrome = currentTitleBar()
    win.setBackgroundColor(chrome.windowBg)
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

async function gateAgentStart(kind: AgentPreflightKind, options?: AgentPreflightOptions) {
  return runAgentPreflight(
    kind,
    {
      runtime,
      isAgentRunning: () => getAgentRunner().isRunning(),
    },
    options,
  )
}

function broadcastAuthChanged(): void {
  const session = getAuthSession()
  broadcastToWindows(IPC.AUTH_CHANGED, session)
}

function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send(channel, payload)
    } catch {
      // ignore
    }
  }
}

let updateCheckTimer: ReturnType<typeof setTimeout> | null = null

function scheduleNextUpdateCheck(checkedAtIso: string): void {
  if (updateCheckTimer) {
    clearTimeout(updateCheckTimer)
    updateCheckTimer = null
  }
  const delay = delayUntilNextUpdateCheck(checkedAtIso)
  updateCheckTimer = setTimeout(() => {
    updateCheckTimer = null
    void runScheduledUpdateCheck()
  }, delay)
}

async function runScheduledUpdateCheck(): Promise<void> {
  const result = await checkForAppUpdate({ forceNotify: false })
  broadcastToWindows(IPC.UPDATE_CHECKED, result)
  if (result.ok) scheduleNextUpdateCheck(result.checkedAt)
}

async function runUpdateCheck(opts?: { forceNotify?: boolean }): Promise<UpdateCheckResult> {
  const result = await checkForAppUpdate({ forceNotify: Boolean(opts?.forceNotify) })
  if (result.ok) scheduleNextUpdateCheck(result.checkedAt)
  return result
}

function registerIpcHandlers(): void {
  bindBuiltinBrowserMainWindow(() =>
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
  )
  registerBuiltinBrowserIpc()
  setAuthSessionListener(broadcastAuthChanged)
  bindUpdateDownloadBroadcast((state) => {
    broadcastToWindows(IPC.UPDATE_PROGRESS, state)
  })
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
  ipcMain.handle(IPC.SITE_GET, () => getSiteSnapshot(getWorkspaceRoot()))
  const currentSiteWorkspace = (expected: unknown): string => {
    const root = path.resolve(getWorkspaceRoot())
    const comparable = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
    if (typeof expected !== 'string' || comparable(path.resolve(expected)) !== comparable(root)) throw new Error('当前工作区已改变，请刷新后重试。')
    return root
  }
  ipcMain.handle(IPC.SITE_CREATE, (_event, expected: unknown) => {
    try {
      const root = currentSiteWorkspace(expected)
      const template = app.isPackaged ? path.join(process.resourcesPath, 'site-template') : path.join(getRepoRoot(), 'desktop', 'site-template')
      return { ok: true, snapshot: createSite(root, template) }
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  })
  ipcMain.handle(IPC.SITE_ADOPT, (_event, expected: unknown) => {
    try { return { ok: true, snapshot: adoptSite(currentSiteWorkspace(expected)) } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  })
  ipcMain.handle(IPC.SITE_OPEN_DIRECTORY, async (_event, kind: unknown, expected: unknown) => {
    if (kind !== 'workspace' && kind !== 'project') return { ok: false, message: '无效的目录类型。' }
    try {
      const state = getSiteSnapshot(currentSiteWorkspace(expected))
      if (kind === 'project' && !['ready', 'existing', 'empty', 'invalid'].includes(state.status)) return { ok: false, message: '站点目录不可用，请先检查工作区。' }
      const error = await shell.openPath(kind === 'workspace' ? state.workspaceRoot : state.projectPath)
      return error ? { ok: false, message: `无法打开目录：${error}` } : { ok: true }
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  })
  const siteAction = async (fn: () => unknown | Promise<unknown>) => {
    try { await fn(); return { ok: true } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  }
  ipcMain.handle(IPC.SITE_RUNTIME_GET, (_event, root: string) => siteRuntime.snapshot(currentSiteWorkspace(root)))
  ipcMain.handle(IPC.SITE_RUNTIME_INSTALL, (_event, root: string, reinstall: unknown, thenPreview: unknown) => siteAction(() => siteRuntime.install(currentSiteWorkspace(root), reinstall === true, thenPreview === true)))
  ipcMain.handle(IPC.SITE_RUNTIME_PREVIEW, (_event, root: string) => siteAction(() => siteRuntime.startPreview(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_RUNTIME_ADDRESS, (_event, root: string, id: string, url: string) => siteAction(() => siteRuntime.setPreviewUrl(currentSiteWorkspace(root), String(id), String(url))))
  ipcMain.handle(IPC.SITE_RUNTIME_BUILD, (_event, root: string) => siteAction(() => siteRuntime.build(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_RUNTIME_OUTPUT, (_event, root: string, output: string) => siteAction(() => siteRuntime.setOutput(currentSiteWorkspace(root), String(output))))
  ipcMain.handle(IPC.SITE_RUNTIME_CANCEL, (_event, root: string, kind: RunKind, id: string) => siteAction(() => {
    if (!['install', 'preview', 'build'].includes(kind)) throw new Error('无效的操作类型。')
    return siteRuntime.cancel(currentSiteWorkspace(root), kind, String(id))
  }))
  ipcMain.handle(IPC.SITE_RUNTIME_OPEN, (_event, root: string, id: string) => siteAction(async () => {
    const url = siteRuntime.previewUrl(currentSiteWorkspace(root), String(id))
    const browser = await ensureBuiltinBrowser()
    if (!browser.ok) throw new Error('内置浏览器暂不可用，请重试。')
    // Recheck after initialization in case the service stopped or workspace changed.
    const current = siteRuntime.previewUrl(currentSiteWorkspace(root), String(id))
    if (current !== url) throw new Error('预览地址已变化，请重试。')
    sitePreviewTab = await openSitePreviewTab(url, siteRuntime.snapshot(currentSiteWorkspace(root)).preview.state === 'running', sitePreviewTab)
  }))
  ipcMain.handle(IPC.CLOUDFLARE_GET_STATE, () => getCloudflareState())
  ipcMain.handle(IPC.CLOUDFLARE_CONNECT, () => connectCloudflare())
  ipcMain.handle(IPC.CLOUDFLARE_CANCEL, () => cancelCloudflareAuth())
  ipcMain.handle(IPC.CLOUDFLARE_SELECT_ACCOUNT, (_event, accountId: unknown) => selectCloudflareAccount(accountId))
  ipcMain.handle(IPC.CLOUDFLARE_DISCONNECT, () => disconnectCloudflare())
  ipcMain.handle(IPC.GITHUB_GET_STATE, () => getGithubState())
  const releaseAction = async <T>(fn: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> => {
    try { return { ok: true, value: await fn() } } catch (error) { return { ok: false, message: error instanceof Error ? error.message : '操作失败。' } }
  }
  const verifyPages = (record: ReleaseRecord, project: PagesProject, root: string) => {
    const repo = record.target
    if (!repo || !record.commitSha || record.pending) throw new Error('请先确认 GitHub 推送已完成。')
    const output = getSiteOutput(root)
    if (!output) throw new Error('请先设置静态产物目录。')
    if (!record.outputDir || output !== record.outputDir) throw new Error('静态产物目录已变化，请重新检查并发布站点。')
    verifyPagesProject(project, { ...repo, output })
  }
  const siteDeployment = new SiteDeployment(githubRepositories, pages, sitePublish, getWorkspaceRoot, verifyPages)
  ipcMain.handle(IPC.SITE_RELEASE_GET, (_event, root: unknown) => releaseAction(() => readRelease(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_RELEASE_PREPARE, (_event, root: unknown, id: unknown, branch: unknown, acceptReadme: unknown) => releaseAction(() => sitePublish.prepare(currentSiteWorkspace(root), id as number, branch as string, acceptReadme === true)))
  ipcMain.handle(IPC.SITE_RELEASE_CANCEL, (_event, root: unknown) => releaseAction(() => sitePublish.cancelBuild(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_RELEASE_FILE, (_event, root: unknown, id: unknown, name: unknown) => releaseAction(() => sitePublish.previewFile(currentSiteWorkspace(root), String(id), String(name))))
  ipcMain.handle(IPC.SITE_RELEASE_COMMIT, (_event, root: unknown, id: unknown) => releaseAction(() => sitePublish.commit(currentSiteWorkspace(root), String(id))))
  ipcMain.handle(IPC.SITE_RELEASE_RECOVER, (_event, root: unknown) => releaseAction(() => sitePublish.recover(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_PAGES_LIST, (_event, root: unknown) => releaseAction(async () => { currentSiteWorkspace(root); const credentials = await getCloudflareCredentials(); const projects = await pages.list(credentials.accountId); currentSiteWorkspace(root); return { accountId: credentials.accountId, projects } }))
  ipcMain.handle(IPC.SITE_PAGES_CREATE, (_event, root: unknown, name: unknown, nodeVersion: unknown) => releaseAction(async () => {
    if (pagesCreationInFlight) throw new Error('项目创建正在进行，请稍候。')
    pagesCreationInFlight = true
    try {
      const workspace = currentSiteWorkspace(root); const record = readRelease(workspace)
      if (!record.target || !record.commitSha || record.pending || record.pendingPages) throw new Error('请先完成 GitHub 推送并确认之前的项目创建结果。')
      if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,57}$/.test(name) || typeof nodeVersion !== 'string' || !/^(?:22|24|26)$/.test(nodeVersion)) throw new Error('请填写有效的 Pages 项目名和 Node 版本。')
      const credentials = await getCloudflareCredentials()
      const existing = await pages.list(credentials.accountId); currentSiteWorkspace(root)
      if (existing.some(project => project.name === name)) throw new Error('项目名称已存在，请选择现有项目或使用其他名称。')
      const output = getSiteOutput(workspace)
      if (!output) throw new Error('请先设置静态产物目录。')
      if (output !== record.outputDir) throw new Error('静态产物目录已变化，请重新检查并发布站点。')
      sitePublish.beginPages(workspace, record.commitSha, record.target.id, record.target.branch, credentials.accountId, name)
      const project = await pages.create(credentials.accountId, name, record.target, output, nodeVersion)
      currentSiteWorkspace(root); verifyPages(record, project, workspace)
      sitePublish.bindPages(workspace, record.commitSha, record.target.id, record.target.branch, credentials.accountId, project.name)
      try { return await siteDeployment.start(workspace) }
      catch (error) { return { ...readRelease(workspace), buildNotice: `项目已创建，但首次构建未确认：${error instanceof Error ? error.message : String(error)}` } }
    } finally { pagesCreationInFlight = false }
  }))
  ipcMain.handle(IPC.SITE_PAGES_CLEAR_PENDING, (_event, root: unknown) => releaseAction(() => {
    if (pagesCreationInFlight) throw new Error('项目创建正在进行，请稍候。')
    return sitePublish.clearPendingPages(currentSiteWorkspace(root))
  }))
  ipcMain.handle(IPC.SITE_PAGES_BIND, (_event, root: unknown, name: unknown) => releaseAction(async () => {
    if (pagesCreationInFlight) throw new Error('项目创建正在进行，请稍候。')
    const workspace = currentSiteWorkspace(root); const record = readRelease(workspace); const credentials = await getCloudflareCredentials()
    const result = await pages.project(credentials.accountId, String(name)); currentSiteWorkspace(root); verifyPages(record, result.project, workspace)
    sitePublish.bindPages(workspace, record.commitSha!, record.target!.id, record.target!.branch, credentials.accountId, result.project.name)
    try { return await siteDeployment.start(workspace) }
    catch (error) { return { ...readRelease(workspace), buildNotice: `项目已关联，但首次构建未确认：${error instanceof Error ? error.message : String(error)}` } }
  }))
  ipcMain.handle(IPC.SITE_PAGES_STATUS, (_event, root: unknown) => releaseAction(async () => {
    const workspace = currentSiteWorkspace(root); const record = readRelease(workspace)
    if (!record.cloudflare || !record.target || !record.commitSha) throw new Error('尚未关联 Cloudflare Pages 项目。')
    const project = await pages.project(record.cloudflare.accountId, record.cloudflare.project); currentSiteWorkspace(root); verifyPages(record, project.project, workspace)
    const status = await pages.status(record.cloudflare.accountId, record.cloudflare.project, record.target.branch, record.commitSha); currentSiteWorkspace(root)
    const latest = readRelease(workspace)
    if (latest.commitSha !== record.commitSha || latest.target?.id !== record.target.id || latest.target?.branch !== record.target.branch || latest.cloudflare?.accountId !== record.cloudflare.accountId || latest.cloudflare?.project !== record.cloudflare.project) throw new Error('发布信息已变化，请重新刷新状态。')
    if (status.deploymentId) sitePublish.confirmDeployment(workspace, record.commitSha, record.cloudflare.accountId, record.cloudflare.project, status.deploymentId, status.createdAt)
    if (status.state === 'success' && status.productionCurrent === true && status.deploymentId && status.productionUrl) sitePublish.noteOnline(workspace, record.commitSha, record.cloudflare.accountId, record.cloudflare.project, status.deploymentId, status.productionUrl)
    return status
  }))
  ipcMain.handle(IPC.SITE_PAGES_DEPLOY, (_event, root: unknown) => releaseAction(() => siteDeployment.start(currentSiteWorkspace(root))))
  ipcMain.handle(IPC.SITE_PAGES_CLEAR_DEPLOYMENT, (_event, root: unknown) => releaseAction(() => {
    if (siteDeployment.isActive() || pagesCreationInFlight) throw new Error('构建请求正在进行，请稍候。')
    return sitePublish.clearPendingDeployment(currentSiteWorkspace(root))
  }))
  ipcMain.handle(IPC.GITHUB_REPOSITORIES, async (_event, root: unknown) => {
    try { currentSiteWorkspace(root); const repositories = await githubRepositories.list(); currentSiteWorkspace(root); return { ok: true, repositories } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : '无法读取仓库。' } }
  })
  ipcMain.handle(IPC.GITHUB_BRANCHES, async (_event, root: unknown, id: unknown) => {
    try { currentSiteWorkspace(root); const branches = await githubRepositories.branches(id as number); currentSiteWorkspace(root); return { ok: true, branches } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : '无法读取分支。' } }
  })
  ipcMain.handle(IPC.GITHUB_CREATE_REPOSITORY, async (_event, root: unknown, name: unknown, privateRepo: unknown) => {
    try { const workspace = currentSiteWorkspace(root); if (getSiteSnapshot(workspace).status !== 'ready') throw new Error('请先创建或恢复本地站点。'); const repository = await githubRepositories.create(name as string, privateRepo as boolean); await sitePublish.markCreated(workspace, repository.fullName); return { ok: true, repository } }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : '无法创建仓库。' } }
  })
  ipcMain.handle(IPC.GITHUB_START_AUTH, () => startGithubAuth())
  ipcMain.handle(IPC.GITHUB_POLL_AUTH, () => pollGithubAuth())
  ipcMain.handle(IPC.GITHUB_CANCEL_AUTH, () => cancelGithubAuth())
  ipcMain.handle(IPC.GITHUB_DISCONNECT, () => disconnectGithub())
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
    const release = releasePlacesDiscoverRun()
    if (release.reload && runtime) {
      await runtime.restart()
    }
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
  ipcMain.handle(
    IPC.APP_AGENT_PREFLIGHT,
    async (_event, kind: AgentPreflightKind, options?: AgentPreflightOptions) => {
    try {
      const requireBuiltinBrowser =
        options && typeof options === 'object' ? options.requireBuiltinBrowser : undefined
      return await gateAgentStart(kind, { requireBuiltinBrowser })
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
      runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
    }
    await runtime.start()
    return {
      ok: runtime.getStatus().state === 'running',
      message:
        runtime.getStatus().state === 'running'
          ? '服务已启动'
          : runtime.getStatus().error || '启动失败',
      status: await buildAppStatus(),
    }
  })
  ipcMain.handle(IPC.OPENCODE_STOP, async () => {
    if (!runtime) {
      return {
        ok: true,
        message: '服务未就绪，请稍后或重启应用',
        status: await buildAppStatus(),
      }
    }
    if (getAgentRunner().isRunning()) {
      await getAgentRunner().abortCurrent()
    }
    await runtime.stop()
    return {
      ok: true,
      message: '服务已停止',
      status: await buildAppStatus(),
    }
  })
  ipcMain.handle(IPC.OPENCODE_RESTART, async () => {
    if (!runtime) {
      runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
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
        message: '暂不支持重新连接，请重启应用',
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
  ipcMain.handle(IPC.LAYOUT_GET, () => storedMainViewLayout(readUserPrefs().mainViewLayout))
  ipcMain.handle(IPC.LAYOUT_SET, (_event, input: unknown) => {
    const next = writableMainViewLayout(input)
    if (!next) return storedMainViewLayout(readUserPrefs().mainViewLayout)
    const saved = writeUserPrefs({ mainViewLayout: next })
    return storedMainViewLayout(saved.mainViewLayout)
  })
  ipcMain.handle(IPC.SETTINGS_SET_OPEN_AT_LOGIN, (_event, enabled: boolean) => {
    applyOpenAtLogin(Boolean(enabled))
    return { ok: true as const, openAtLogin: Boolean(enabled) }
  })
  ipcMain.handle(IPC.SETTINGS_SET_CLOSE_TO_TRAY, (_event, enabled: boolean) => {
    applyCloseToTrayEnabled(Boolean(enabled))
    return { ok: true as const, closeToTrayEnabled: Boolean(enabled) }
  })
  ipcMain.handle(IPC.SETTINGS_SET_UI_THEME, (_event, mode: UiThemeMode) =>
    applyUiThemeMode(mode, () =>
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
    ),
  )
  ipcMain.handle(IPC.SETTINGS_SET_EXPLORE_INTENSITY, (_event, intensity: unknown) => {
    const exploreIntensity = applyExploreIntensity(intensity)
    return { ok: true as const, exploreIntensity }
  })
  ipcMain.handle(IPC.SETTINGS_DETECT_GOOGLE_PROXY, () => detectSystemGoogleProxy())
  ipcMain.handle(
    IPC.SETTINGS_TEST_GOOGLE_PLACES,
    async (
      _event,
      input?: {
        mode?: 'off' | 'system' | 'manual'
        manualProxyUrl?: string
      },
    ) => {
      const keyRes = await resolvePlacesApiKeyForConnectivityTest()
      if (!keyRes.ok) {
        return { ok: false as const, message: keyRes.message }
      }
      return testGooglePlacesConnectivity({
        ...input,
        apiKey: keyRes.apiKey,
      })
    },
  )
  ipcMain.handle(IPC.SETTINGS_TEST_HUNTER, async () => testHunterConnectivity())
  ipcMain.handle(IPC.ONBOARDING_GET_STATE, () => getOnboardingState())
  ipcMain.handle(
    IPC.ONBOARDING_SET_STATE,
    (_event, patch: Partial<OnboardingState>) => patchOnboardingState(patch ?? {}),
  )
  ipcMain.handle(IPC.ONBOARDING_PROBE_ENV, () => probeEnvironment())
  ipcMain.handle(IPC.BUSINESS_GUIDE_GET, () => getBusinessGuideState())
  ipcMain.handle(IPC.BUSINESS_GUIDE_MARK, (_event, disposition: 'completed' | 'skipped') =>
    markBusinessGuide(disposition),
  )
  ipcMain.handle(IPC.DEFAULT_LANDING_PEEK, () => ({ consumed: peekDefaultLanding() }))
  ipcMain.handle(IPC.DEFAULT_LANDING_COMMIT, () => {
    commitDefaultLanding()
    return { consumed: true as const }
  })
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
  ipcMain.handle(
    IPC.APP_SAVE_TEXT_TO_DOWNLOADS,
    (_event, input: SaveTextToDownloadsInput) =>
      saveTextToDownloads(app.getPath('downloads'), input),
  )
  ipcMain.handle(IPC.UPDATE_CHECK, async (_event, opts?: { forceNotify?: boolean }) =>
    runUpdateCheck(opts),
  )
  ipcMain.handle(IPC.UPDATE_SNOOZE, () => {
    snoozeAppUpdate()
    return { ok: true }
  })
  ipcMain.handle(IPC.UPDATE_DISMISS, (_event, version: string) => {
    dismissAppUpdate(String(version || ''))
    return { ok: true }
  })
  ipcMain.handle(IPC.UPDATE_STATE, () => getUpdateDownloadState())
  ipcMain.handle(IPC.UPDATE_RETRY, () => {
    retryUpdateDownload()
    return getUpdateDownloadState()
  })
  ipcMain.handle(IPC.UPDATE_INSTALL, () => installDownloadedUpdate())
  ipcMain.handle(IPC.UPDATE_DEFER, () => {
    deferUpdateInstall()
    return getUpdateDownloadState()
  })
  ipcMain.handle(IPC.NOTIFY_SET_WORKFLOW_SUPPRESSED, (_event, suppressed: boolean) => {
    setWorkflowNotifySuppressed(Boolean(suppressed))
  })
  ipcMain.handle(
    IPC.NOTIFY_SHOW_TASK_DONE,
    (_event, input: { ok?: boolean; body?: string }) =>
      showTaskDoneNotification({
        ok: Boolean(input?.ok),
        body: String(input?.body ?? ''),
      }),
  )
  ipcMain.handle(IPC.SCHEDULE_LIST, () => ({
    ok: true as const,
    schedules: listWorkflowSchedules(),
  }))
  ipcMain.handle(IPC.SCHEDULE_SAVE, (_event, input: WorkflowScheduleSaveInput) =>
    saveWorkflowSchedule(input),
  )
  ipcMain.handle(IPC.SCHEDULE_DELETE, (_event, id: string) =>
    deleteWorkflowSchedule(String(id || '')),
  )
  ipcMain.handle(
    IPC.SCHEDULE_MARK_RUN,
    (
      _event,
      input: { scheduleId?: string; skipped?: boolean; ok?: boolean },
    ) => {
      handleScheduleRunResult({
        scheduleId: String(input?.scheduleId || ''),
        skipped: Boolean(input?.skipped),
        ok: Boolean(input?.ok),
      })
      return { ok: true as const }
    },
  )
  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, input: SettingsSaveInput) => {
    const result = saveSettings(input)
    placesOfficialKeyMemory.clear()
    setPlacesMcpInjection({ kind: 'default' })
    if (!runtime) {
      runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
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
          runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
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
  ipcMain.handle(IPC.PLACES_OFFICIAL_APPLY, async () => applyPlacesOfficialKey())
  ipcMain.handle(IPC.PLACES_OFFICIAL_REFRESH, async () => refreshPlacesOfficialKey())
  ipcMain.handle(IPC.SETTINGS_PICK_WORKSPACE, async () => {
    const dir = await pickWorkspaceDirectory()
    if (!dir) return { path: null, restarted: false }

    if (siteRuntime.hasActive() || sitePublish.hasActive() || pagesCreationInFlight) {
      const choice = await dialog.showMessageBox({
        type: 'question',
        title: '切换工作区',
        message: '当前站点仍有预览、构建或发布操作正在运行。',
        detail: '切换前需要停止本地操作；远端提交或项目创建需要等待结果。',
        buttons: ['停止并切换', '取消'],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice.response !== 0) return { path: null, restarted: false }
      if (pagesCreationInFlight || !await sitePublish.shutdown()) {
        await dialog.showMessageBox({ type: 'error', message: '发布操作尚未停止或远端结果未确认，请稍后再切换工作区。' })
        return { path: null, restarted: false }
      }
      if (!await siteRuntime.shutdown()) {
        await dialog.showMessageBox({ type: 'error', message: '站点进程停止未确认，请检查后再切换工作区。' })
        return { path: null, restarted: false }
      }
    }

    const init = initializeWorkspace(dir, { forceManaged: true })
    writeUserPrefs({ workspaceRoot: dir })
    process.env.FTCS_WORKSPACE = dir

    // 新工作区通常需安装/构建 MCP 依赖
    await ensureMcpServersReady(dir)

    if (!runtime) {
      runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
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

  ipcMain.handle(IPC.LEADS_SAVE_ICEBREAK, (_event, input) => {
    try {
      return saveLeadIcebreak(input)
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('expand-keywords', { product_id: productId }, {}, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('score-and-dedupe', { product_id: productId }, {}, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
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

        const verifyEmails = getSettingsSnapshot().hunterVerifyEmails
        const sender = event.sender
        const targets = leadIds.length > 0 ? leadIds : leadId ? [leadId] : undefined
        const taskId = getAgentRunner().launchButton('enrich-lead-contacts', { product_id: productId }, { lead_ids: targets, verify_emails: verifyEmails }, payload => emitAgentEvent(sender, payload))

        const scope =
          targets && targets.length === 1
            ? targets[0]
            : targets && targets.length > 1
              ? `${targets.length} 条线索`
              : '全部待补全线索'
        return {
          ok: true, taskId,
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

      const leadIds = Array.isArray(input.leadIds)
        ? input.leadIds.filter((id) => typeof id === 'string' && id.trim())
        : undefined
      const explicit = Boolean(leadIds && leadIds.length > 0)
      const targetIds = explicit ? leadIds! : listLeadsNeedingDraft(productId)
      const capped = capDraftOutreachLeadIds(targetIds, { rankedByScore: !explicit })

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('draft-outreach-email', { product_id: productId }, { mode: 'batch', lead_ids: leadIds }, payload => emitAgentEvent(sender, payload))

      const scope = explicit
        ? `${capped.leadIds.length} 条指定线索`
        : '全部待起草已评分线索'
      return {
        ok: true, taskId,
        message:
          capped.notice || `正在为 ${productId} 起草开发信（${scope}）…`,
        productId,
        acceptedCount: capped.leadIds.length,
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

      const sender = event.sender
      const recipientKey = audience === 'company' ? 'company' : (input.recipientKey || slotKeyForEmail(input.email ?? ''))
      if (!recipientKey) throw new Error('个人向起草需要收件槽或邮箱')
      const taskId = getAgentRunner().launchButton('draft-outreach-email', { product_id: productId, lead_id: leadId, recipient_key: recipientKey }, { mode: 'slot', email: input.email }, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('translate-outreach-email', { product_id: productId, lead_id: leadId, recipient_key: recipientKey }, {}, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('discover-leads', { product_id: productId }, { max_queries: input.maxQueries }, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
        message: '正在准备…',
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('discover-leads-r2', { product_id: productId }, { max_queries: input.maxQueries }, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
        message: '正在准备…',
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

      const sender = event.sender
      const taskId = getAgentRunner().launchButton('discover-leads-r3', { product_id: productId }, { max_queries: input.maxQueries }, payload => emitAgentEvent(sender, payload))

      return {
        ok: true, taskId,
        message: '正在准备…',
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

  ipcMain.handle(IPC.AGENT_REPLY_QUESTION, async (_event, input: unknown) => {
    return getAgentRunner().replyToPendingQuestion(input)
  })

  ipcMain.handle(IPC.AGENT_REPLY_PERMISSION, async (_event, input: unknown) => {
    return getAgentRunner().replyToPendingPermission(input)
  })

  ipcMain.handle(IPC.AGENT_NOTE_PRODUCT, async (_event, productId: unknown) => {
    getAgentRunner().noteActiveProduct(typeof productId === 'string' ? productId : '')
    return { ok: true }
  })

  ipcMain.handle(IPC.TASK_SNAPSHOT, () => getTaskJournal().snapshot())
  ipcMain.handle(IPC.WORKFLOW_LAUNCH_STEP, async (event, node: string, productId: string, origin: 'workflow' | 'schedule') => {
    const skills: Record<string, TaskSkill> = {
      'discover-r1': 'discover-leads', 'discover-r2': 'discover-leads-r2', 'discover-r3': 'discover-leads-r3',
      'expand-keywords': 'expand-keywords', 'score-and-dedupe': 'score-and-dedupe',
      'enrich-lead-contacts': 'enrich-lead-contacts', 'draft-outreach-email': 'draft-outreach-email',
    }
    if (!Object.hasOwn(skills, node) || !['schedule', 'workflow'].includes(origin)) throw new Error('未知编排步骤')
    const runner = getAgentRunner()
    await runner.waitForFinishedButton()
    const parameters = node === 'draft-outreach-email' ? { mode: 'batch' as const } :
      node === 'enrich-lead-contacts' ? { verify_emails: getSettingsSnapshot().hunterVerifyEmails } : {}
    return runner.launchButton(skills[node], { product_id: productId }, parameters, payload => emitAgentEvent(event.sender, payload), origin)
  })
  ipcMain.handle(IPC.AGENT_CREATE_SESSION, (event) =>
    getAgentRunner().createChatSession(payload => emitAgentEvent(event.sender, payload)),
  )
  ipcMain.handle(IPC.AGENT_CURRENT_SESSION, () => getAgentRunner().currentChatSessionId())
  ipcMain.handle(IPC.AGENT_SEND_MESSAGE, async (event, text: unknown, productId: unknown) => {
    if (typeof productId === 'string') {
      getAgentRunner().noteActiveProduct(productId)
    }
    const message = typeof text === 'string' ? text : ''
    const sender = event.sender
    return getAgentRunner().sendFreeDialogue(message, (payload) => emitAgentEvent(sender, payload))
  })

  ipcMain.handle(IPC.PROFILE_GENERATE, async (event, input: ProfileGenerateInput) => {
    try {

      const sources = [...(input?.websitePaths ?? []), ...(input?.filePaths ?? [])]
      const taskId = getAgentRunner().launchButton('extract-product-profile', {}, { library_sources: sources }, payload => emitAgentEvent(event.sender, payload))
      return { ok: true, taskId, message: '正在准备产品资料…' }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

async function bootstrapOpenCode(): Promise<void> {
  runtime = new OpenCodeRuntime({ taskReceiver: getAgentRunner })
  try {
    await runtime.start()
  } catch (err) {
    // start() 内部已落状态；此处再兜底，避免挡住窗口
    console.error('[opencode] bootstrap failed:', err)
  }
}

app.whenReady().then(async () => {
  // 主题：跟随 prefs（dark/light/system），不再写死 dark
  bootstrapUiThemeFromPrefs()
  if (process.platform === 'win32') {
    // 打包态用 appId；开发态按 Electron 文档用 execPath（需开始菜单固定 electron.exe 才有可靠 click）
    const aumid = app.isPackaged ? 'com.ftcs.desktop' : process.execPath
    app.setAppUserModelId(aumid)
  }
  console.log('[ftcs:notify] setAppUserModelId', {
    packaged: app.isPackaged,
    execPath: process.execPath,
  })

  nativeTheme.on('updated', () => {
    if (getStoredUiThemeMode() !== 'system') return
    applyUiThemeMode('system', () =>
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
    )
  })

  installUnexpectedWebContentsGuard()
  registerIpcHandlers()

  startHidden = shouldStartHidden()
  syncOpenAtLoginFromPrefs()

  createAppTray(
    {
      onShow: () => showMainWindow(mainWindow),
      onQuit: () => {
        isQuitting = true
        app.quit()
      },
    },
    getAppIconPath(),
  )

  // 先开窗口，再拉起内置浏览器，再启 OpenCode。网关地址要在改写 MCP 命令之前就绪。
  await createWindow()
  try {
    await ensureBuiltinBrowser()
  } catch (err) {
    console.error('[builtin-browser] ensure failed', err)
  }
  void bootstrapOpenCode()

  startWorkflowScheduler({
    getMainWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
  })

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startHidden = false
      await createWindow()
    } else {
      showMainWindow(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  // 托盘常驻：隐藏窗口不销毁时不会到这里；真退出由托盘「退出」触发
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
  }
})

/**
 * 修复残留 opencode：Electron 的 before-quit 不会等待 async。
 * 必须先 preventDefault，等 stop() 完成（含 taskkill）再真正退出。
 */
app.on('before-quit', (event) => {
  isQuitting = true
  noteBuiltinBrowserQuitting()
  stopWorkflowScheduler()
  destroyAppTray()
  if (isCleaningUp) return
  event.preventDefault()
  isCleaningUp = true

  void (async () => {
    try {
      await sitePublish.shutdown()
      await siteRuntime.shutdown()
      await shutdownBuiltinBrowser()
      await runtime?.stop()
    } catch (err) {
      console.error('[opencode] cleanup on quit failed:', err)
    } finally {
      app.exit(0)
    }
  })()
})
