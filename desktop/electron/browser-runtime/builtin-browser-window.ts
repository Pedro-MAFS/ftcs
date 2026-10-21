import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  WebContentsView,
  screen,
  type WebContents,
} from 'electron'
import captionHtml from './caption.html?raw'
import {
  CAPTION_HEIGHT,
  CARD,
  THUMB,
  anchorExpanded,
  anchorTopRight,
} from './anchor'
import { attachMainWindowFollow } from './follow-main-window'
import { sendPageCommand, tokenPageUrl } from './cdp-gateway'
import type { BuiltinBrowserMode, BuiltinBrowserUiState, ScreenRect } from './types'
import { IPC } from '../ipc/types'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

const allowedWebContents = new Set<number>()
let constructing = 0
let guardInstalled = false
let destroyAllowed = false
let appQuitting = false

let browserWindow: BrowserWindow | null = null
let pageView: WebContentsView | null = null
let mode: BuiltinBrowserMode = 'thumbnail'
let detached = false
let pageTitle = '内置浏览器'
let pageUrlLabel = '尚未打开页面'
let expectedBounds: ScreenRect | null = null

type UiListener = (state: BuiltinBrowserUiState) => void
const uiListeners = new Set<UiListener>()

export function allowCreatedWebContentsDuring<T>(fn: () => T): T {
  constructing += 1
  try {
    return fn()
  } finally {
    constructing -= 1
  }
}

export function installUnexpectedWebContentsGuard(): void {
  if (guardInstalled) return
  guardInstalled = true
  app.on('web-contents-created', (_event, contents) => {
    if (constructing > 0) {
      allowedWebContents.add(contents.id)
      return
    }
    const type = contents.getType()
    if (type !== 'window' && type !== 'browserView' && type !== 'webview') return
    if (contents.hostWebContents) return
    setImmediate(() => closeUnexpected(contents))
  })
}

function closeUnexpected(contents: WebContents): void {
  if (contents.isDestroyed()) return
  if (allowedWebContents.has(contents.id)) return
  if (contents.hostWebContents) return
  try {
    contents.close()
  } catch {
    // 名单外的页面已经不在
  }
}

export function noteBuiltinBrowserQuitting(): void {
  appQuitting = true
  destroyAllowed = true
  destroyBuiltinBrowserWindow()
}

export function isBuiltinBrowserQuitting(): boolean {
  return appQuitting
}

export function onBuiltinBrowserUi(listener: UiListener): () => void {
  uiListeners.add(listener)
  return () => uiListeners.delete(listener)
}

export function getBuiltinBrowserUiState(): BuiltinBrowserUiState {
  const alive = Boolean(browserWindow && !browserWindow.isDestroyed())
  return {
    alive,
    visible: alive && browserWindow!.isVisible(),
    mode,
    title: pageTitle,
    url: pageUrlLabel,
  }
}

export function isBuiltinWindowAlive(): boolean {
  return Boolean(browserWindow && !browserWindow.isDestroyed())
}

export function getBuiltinBrowserMode(): BuiltinBrowserMode {
  return mode
}

export async function ensureBuiltinBrowserWindow(main: BrowserWindow): Promise<boolean> {
  if (appQuitting) return false
  if (browserWindow && !browserWindow.isDestroyed()) return false
  const win = allowCreatedWebContentsDuring(
    () =>
      new BrowserWindow({
        width: THUMB.width,
        height: THUMB.height,
        show: false,
        frame: false,
        parent: main,
        modal: false,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        focusable: true,
        backgroundColor: '#1A1A1A',
        roundedCorners: true,
        title: '内置浏览器',
        webPreferences: {
          preload: path.join(moduleDir, '../preload/caption.mjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      }),
  )
  browserWindow = win
  const view = allowCreatedWebContentsDuring(
    () =>
      new WebContentsView({
        webPreferences: {
          partition: 'ftcs-builtin-browser',
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
          backgroundThrottling: false,
        },
      }),
  )
  pageView = view
  view.webContents.setBackgroundThrottling(false)
  win.contentView.addChildView(view)
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void view.webContents.loadURL(url)
    return { action: 'deny' }
  })
  view.webContents.on('page-title-updated', (_event, title) => {
    pageTitle = title.trim() || '内置浏览器'
    publishUi()
  })
  const onUrl = (_event: unknown, url: string) => {
    applyPageUrl(url)
  }
  view.webContents.on('did-navigate', onUrl)
  view.webContents.on('did-navigate-in-page', onUrl)
  win.on('moved', () => {
    if (!browserWindow || browserWindow.isDestroyed() || mode === 'expanded') return
    const bounds = browserWindow.getBounds()
    if (expectedBounds && near(bounds, expectedBounds)) return
    detached = true
  })
  win.on('close', (event) => {
    if (destroyAllowed || appQuitting) return
    event.preventDefault()
    void setBuiltinBrowserMode('card')
  })
  win.on('show', publishUi)
  win.on('hide', publishUi)
  attachMainWindowFollow(main, {
    getMode: () => mode,
    isDetached: () => detached,
    isBrowserVisible: () => Boolean(browserWindow && !browserWindow.isDestroyed() && browserWindow.isVisible()),
    reanchor: () => {
      const bounds = boundsFor(mode)
      applyBounds(bounds)
      layoutPage(mode, bounds)
    },
    showInactive: () => showBuiltinBrowserInactive(),
    hideBrowser: () => {
      if (browserWindow && !browserWindow.isDestroyed()) browserWindow.hide()
    },
    onMainClosed: () => noteBuiltinBrowserQuitting(),
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(captionHtml)}`)
  const token = tokenPageUrl()
  if (token) await view.webContents.loadURL(token)
  await setBuiltinBrowserMode('thumbnail')
  showBuiltinBrowserInactive()
  return true
}

export async function setBuiltinBrowserMode(next: BuiltinBrowserMode): Promise<void> {
  if (!browserWindow || browserWindow.isDestroyed()) return
  mode = next
  if (next === 'expanded') detached = false
  const bounds = boundsFor(next)
  const viewportHeight = next === 'card' ? 200 : Math.max(1, bounds.height - CAPTION_HEIGHT)
  const viewportWidth = next === 'expanded' ? bounds.width : THUMB.width
  if (next === 'card') pageView?.webContents.setBackgroundThrottling(false)
  try {
    await sendPageCommand('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    })
  } catch {
    // 视口度量失败不拆掉页面
  }
  applyBounds(bounds)
  layoutPage(next, bounds)
  publishUi()
}

export function showBuiltinBrowserInactive(): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  const main = win.getParentWindow()
  if (main && (main.isDestroyed() || main.isMinimized() || !main.isVisible())) return
  win.showInactive()
  publishUi()
}

export async function showBuiltinBrowserFromTitleBar(): Promise<void> {
  const win = browserWindow
  const alive = Boolean(win && !win.isDestroyed())
  const visible = Boolean(alive && win!.isVisible())
  if (!alive || !visible || mode === 'card') {
    await setBuiltinBrowserMode('thumbnail')
    showBuiltinBrowserInactive()
    return
  }
  win!.moveTop()
  win!.showInactive()
  publishUi()
}

export function destroyBuiltinBrowserWindow(): void {
  destroyAllowed = true
  const win = browserWindow
  browserWindow = null
  pageView = null
  mode = 'thumbnail'
  detached = false
  pageTitle = '内置浏览器'
  pageUrlLabel = '尚未打开页面'
  if (win && !win.isDestroyed()) win.destroy()
  publishUi()
  destroyAllowed = appQuitting
}

function boundsFor(next: BuiltinBrowserMode): ScreenRect {
  const main = browserWindow?.getParentWindow()
  const workArea = workAreaFor(main)
  if (next === 'expanded') return anchorExpanded(workArea)
  const mainBounds = main && !main.isDestroyed() ? main.getBounds() : workArea
  return anchorTopRight(mainBounds, next === 'card' ? CARD : THUMB, workArea)
}

function layoutPage(next: BuiltinBrowserMode, bounds: ScreenRect): void {
  if (!pageView) return
  if (next === 'card') {
    pageView.setBounds({ x: 0, y: CAPTION_HEIGHT, width: CARD.width, height: 200 })
    return
  }
  pageView.setBounds({
    x: 0,
    y: CAPTION_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - CAPTION_HEIGHT),
  })
}

function applyBounds(bounds: ScreenRect): void {
  expectedBounds = bounds
  if (!browserWindow || browserWindow.isDestroyed()) return
  browserWindow.setBounds(bounds)
}

function workAreaFor(main: BrowserWindow | null | undefined): ScreenRect {
  if (main && !main.isDestroyed()) {
    return screen.getDisplayMatching(main.getBounds()).workArea
  }
  return screen.getPrimaryDisplay().workArea
}

function applyPageUrl(url: string): void {
  if (!url || url.includes('/__ftcs_builtin_page__') || url.startsWith('about:')) {
    pageTitle = '内置浏览器'
    pageUrlLabel = '尚未打开页面'
  } else {
    pageUrlLabel = url
  }
  publishUi()
}

function publishUi(): void {
  const state = getBuiltinBrowserUiState()
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.webContents.send(IPC.BUILTIN_BROWSER_CAPTION, {
      mode: state.mode,
      title: state.title,
      url: state.url,
    })
  }
  for (const listener of uiListeners) listener(state)
}

function near(actual: ScreenRect, expected: ScreenRect): boolean {
  return Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2
}
