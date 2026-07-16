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
/** Electron 不会 await before-quit；需要 preventDefault + 二次 quit */
let isCleaningUp = false

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
