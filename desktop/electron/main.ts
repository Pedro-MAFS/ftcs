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
import { writeUserPrefs } from './config/user-prefs'
import { initializeWorkspace, ensureMcpServersReady } from './config/workspace-init'
import {
  addWebsite,
  createFolder,
  deleteFilesEntry,
  deleteWebsite,
  ensureLibraryDirs,
  importFilesFromPaths,
  listFilesDir,
  listWebsites,
  pasteClipboardFiles,
  pickAndImportFiles,
} from './library/library-service'
import type {
  LibrarySnapshot,
  ProfileGenerateInput,
  ProfileSaveInput,
  KeywordsSaveInput,
  DiscoverLeadsInput,
  RawLeadSaveInput,
  DraftEmailsInput,
  RejectEmailDraftInput,
} from './ipc/types'
import { AgentRunController } from './opencode/agent-runner'
import { bootstrapProductFromLibrary } from './profile/profile-bootstrap'
import { listProductSummaries, loadProfile } from './profile/profile-reader'
import { createEmptyDraftProfile, saveProductProfile, softDeleteProductProfile } from './profile/profile-writer'
import { loadExpansion, saveExpansion } from './keywords/keywords-reader'
import { listExploreTasks } from './exploration/explore-tasks'
import { listLeadsSnapshot } from './leads/leads-reader'
import { saveRawLead } from './leads/lead-writer'
import { listEmailDraftsSnapshot } from './emails/emails-reader'
import { rejectEmailDraft } from './emails/emails-writer'

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

function getWindowOptions(): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    title: '外贸获客智能体',
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
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
    devMode: !app.isPackaged,
    requiresLocalOpenCode: true,
  }
}

function buildLibrarySnapshot(cwd = ''): LibrarySnapshot {
  const workspaceRoot = getWorkspaceRoot()
  ensureLibraryDirs(workspaceRoot)
  const listed = listFilesDir(cwd, workspaceRoot)
  return {
    websites: listWebsites(workspaceRoot),
    cwd: listed.cwd,
    entries: listed.entries,
    filesRootLabel: listed.cwd ? `data/library/files/${listed.cwd}` : 'data/library/files',
  }
}

function libraryOk(message: string, cwd = '', extra?: Partial<{ imported: number; skipped: string[] }>) {
  return {
    ok: true,
    message,
    snapshot: buildLibrarySnapshot(cwd),
    ...extra,
  }
}

function libraryFail(err: unknown, cwd = '') {
  return {
    ok: false,
    message: err instanceof Error ? err.message : String(err),
    snapshot: buildLibrarySnapshot(cwd),
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.APP_GET_STATUS, async () => buildAppStatus())
  ipcMain.handle(IPC.OPENCODE_RESTART, async () => {
    if (!runtime) {
      runtime = new OpenCodeRuntime()
    }
    await runtime.restart()
    return buildAppStatus()
  })
  ipcMain.handle(IPC.OPENCODE_GET_LOGS, () => runtime?.getLogs() ?? [])

  ipcMain.handle(IPC.SETTINGS_GET, () => getSettingsSnapshot())
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
    try {
      addWebsite(url)
      return libraryOk('已保存公司网站', cwd ?? '')
    } catch (err) {
      return libraryFail(err, cwd ?? '')
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
        createFolder(cwd, payload.name)
        return libraryOk('已创建目录', cwd)
      } catch (err) {
        return libraryFail(err, cwd)
      }
    },
  )

  ipcMain.handle(IPC.LIBRARY_UPLOAD_FILES, async (_event, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const { imported, skipped } = await pickAndImportFiles(dir, mainWindow)
      if (imported === 0 && skipped.length === 0) {
        return libraryOk('', dir, { imported: 0, skipped: [] })
      }
      const parts: string[] = []
      if (imported) parts.push(`已导入 ${imported} 个文件`)
      if (skipped.length) parts.push(`跳过：${skipped.join('；')}`)
      return {
        ok: imported > 0,
        message: parts.join('。'),
        snapshot: buildLibrarySnapshot(dir),
        imported,
        skipped,
      }
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(
    IPC.LIBRARY_IMPORT_PATHS,
    (_event, payload: { cwd?: string; paths: string[] }) => {
      const dir = payload.cwd ?? ''
      try {
        const { imported, skipped } = importFilesFromPaths(dir, payload.paths ?? [])
        const parts: string[] = []
        if (imported) parts.push(`已粘贴/导入 ${imported} 个文件`)
        if (skipped.length) parts.push(`跳过：${skipped.join('；')}`)
        return {
          ok: imported > 0,
          message: parts.join('。') || '没有可导入的文件',
          snapshot: buildLibrarySnapshot(dir),
          imported,
          skipped,
        }
      } catch (err) {
        return libraryFail(err, dir)
      }
    },
  )

  ipcMain.handle(IPC.LIBRARY_PASTE_CLIPBOARD, (_event, cwd?: string) => {
    const dir = cwd ?? ''
    try {
      const { imported, skipped } = pasteClipboardFiles(dir)
      if (imported === 0) {
        return {
          ok: false,
          message: skipped[0] || '剪贴板中没有可粘贴的文件',
          snapshot: buildLibrarySnapshot(dir),
          imported: 0,
          skipped,
        }
      }
      const parts = [`已粘贴 ${imported} 个文件`]
      if (skipped.length) parts.push(`跳过：${skipped.join('；')}`)
      return {
        ok: true,
        message: parts.join('。'),
        snapshot: buildLibrarySnapshot(dir),
        imported,
        skipped,
      }
    } catch (err) {
      return libraryFail(err, dir)
    }
  })

  ipcMain.handle(
    IPC.LIBRARY_DELETE_ENTRY,
    (_event, payload: { relativePath: string; cwd?: string }) => {
      const cwd = payload.cwd ?? ''
      try {
        deleteFilesEntry(payload.relativePath)
        return libraryOk('已删除', cwd)
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

  ipcMain.handle(IPC.KEYWORDS_EXPAND, async (event, productId: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      if (getAgentRunner().isRunning()) {
        return {
          ok: false,
          message: '已有 Agent 任务在运行',
        }
      }
      if (runtime?.getStatus().state !== 'running' || !runtime.getClient()) {
        return {
          ok: false,
          message: 'OpenCode 未就绪，请先在设置页确认运行时或点击「重启 OpenCode」',
        }
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
      if (getAgentRunner().isRunning()) {
        return {
          ok: false,
          message: '已有 Agent 任务在运行',
        }
      }
      if (runtime?.getStatus().state !== 'running' || !runtime.getClient()) {
        return {
          ok: false,
          message: 'OpenCode 未就绪，请先在设置页确认运行时或点击「重启 OpenCode」',
        }
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

  ipcMain.handle(IPC.EMAIL_DRAFT_LIST, (_event, productId: string) => {
    try {
      if (!productId || typeof productId !== 'string') {
        return {
          productId: '',
          drafts: [],
          pendingHighLeadIds: [],
          stats: { total: 0, pendingReview: 0, pendingHigh: 0 },
        }
      }
      return listEmailDraftsSnapshot(productId)
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

  ipcMain.handle(IPC.EMAIL_DRAFT_REJECT, (_event, input: RejectEmailDraftInput) => {
    try {
      return rejectEmailDraft(input)
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
      if (getAgentRunner().isRunning()) {
        return { ok: false, message: '已有 Agent 任务在运行' }
      }
      if (runtime?.getStatus().state !== 'running' || !runtime.getClient()) {
        return {
          ok: false,
          message: 'OpenCode 未就绪，请先在设置页确认运行时或点击「重启 OpenCode」',
        }
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
          : '全部待起草 high 线索'
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

  ipcMain.handle(IPC.EXPLORATION_START_R1, async (event, input: DiscoverLeadsInput) => {
    try {
      const productId = input?.productId
      if (!productId || typeof productId !== 'string') {
        return { ok: false, message: '缺少 productId' }
      }
      if (getAgentRunner().isRunning()) {
        return {
          ok: false,
          message: '已有 Agent 任务在运行',
        }
      }
      if (runtime?.getStatus().state !== 'running' || !runtime.getClient()) {
        return {
          ok: false,
          message: 'OpenCode 未就绪，请先在设置页确认运行时或点击「重启 OpenCode」',
        }
      }

      const sender = event.sender
      void getAgentRunner()
        .runDiscoverLeads(
          productId,
          (payload) => emitAgentEvent(sender, payload),
          {
            rounds: input.rounds,
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

  ipcMain.handle(IPC.PROFILE_ABORT, async () => {
    await getAgentRunner().abortCurrent()
    return { ok: true }
  })

  ipcMain.handle(IPC.PROFILE_GENERATE, async (event, input: ProfileGenerateInput) => {
    try {
      if (getAgentRunner().isRunning()) {
        return {
          ok: false,
          message: '已有 Agent 任务在运行',
        }
      }
      if (runtime?.getStatus().state !== 'running' || !runtime.getClient()) {
        return {
          ok: false,
          message: 'OpenCode 未就绪，请先在设置页确认运行时或点击「重启 OpenCode」',
        }
      }

      const bootstrap = bootstrapProductFromLibrary({
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
