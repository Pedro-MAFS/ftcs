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
import overlayHtml from './overlay.html?raw'
import { CAPTION_HEIGHT, THUMB, anchorExpanded, anchorTopRight } from './anchor'
import { attachMainWindowFollow, type MainWindowFollowController } from './follow-main-window'
import { sendPageCommand, tokenPageUrl } from './cdp-gateway'
import type { BuiltinBrowserMode, BuiltinBrowserUiState, ScreenRect } from './types'
import { IPC } from '../ipc/types'
import {
  detachedAfterMode,
  modeAfterEnsure,
  modeAfterUserDismiss,
  navigationMode,
  showsThumbnailOverlay,
  titleBarRequestsRaise,
  viewportForMode,
} from './window-policy'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

const allowedWebContents = new Set<number>()
let constructing = 0
let guardInstalled = false
let destroyAllowed = false
let appQuitting = false

let browserWindow: BrowserWindow | null = null
let pageView: WebContentsView | null = null
let overlayView: WebContentsView | null = null
let follow: MainWindowFollowController | null = null
let mode: BuiltinBrowserMode = modeAfterEnsure()
let detached = false
let lastThumbBounds: ScreenRect | null = null
let pageTitle = '内置浏览器'
let pageUrlLabel = '尚未打开页面'
let expectedBounds: ScreenRect | null = null
let modeChain: Promise<void> = Promise.resolve()
let forcingHide = false
let forcedHides = 0

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
          preload: captionPreloadPath(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      }),
  )
  browserWindow = win
  mode = modeAfterEnsure()
  win.on('show', onBrowserShow)
  win.on('hide', publishUi)
  if (win.isVisible()) win.hide()

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

  const overlay = allowCreatedWebContentsDuring(
    () =>
      new WebContentsView({
        webPreferences: {
          preload: captionPreloadPath(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      }),
  )
  overlayView = overlay
  overlay.setVisible(false)
  win.contentView.addChildView(overlay)
  try {
    overlay.setBackgroundColor('#00000000')
  } catch {
    // 透明底失败时缩略页会被蒙层挡住，不因此拆掉窗口
  }
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.on('moved', () => {
    if (!browserWindow || browserWindow.isDestroyed() || mode !== 'thumbnail') return
    const bounds = browserWindow.getBounds()
    if (expectedBounds && near(bounds, expectedBounds)) return
    detached = true
    lastThumbBounds = bounds
  })
  win.on('close', (event) => {
    if (destroyAllowed || appQuitting) return
    event.preventDefault()
    void setBuiltinBrowserMode(modeAfterUserDismiss())
  })
  follow = attachMainWindowFollow(main, {
    getMode: () => mode,
    isDetached: () => detached,
    isBrowserVisible: () => Boolean(browserWindow && !browserWindow.isDestroyed() && browserWindow.isVisible()),
    reanchor: () => {
      const bounds = boundsFor('thumbnail')
      applyBounds(bounds)
      layoutViews('thumbnail', bounds)
    },
    showInactive: () => showBuiltinBrowserInactive(),
    hideBrowser: () => {
      if (browserWindow && !browserWindow.isDestroyed()) browserWindow.hide()
    },
    onMainClosed: () => noteBuiltinBrowserQuitting(),
  })
  follow.setVisibleBefore(false)
  await win.loadURL(dataHtml(captionHtml))
  await overlay.webContents.loadURL(dataHtml(overlayHtml))
  const token = tokenPageUrl()
  if (token) await view.webContents.loadURL(token)
  await setBuiltinBrowserMode(modeAfterEnsure())
  return true
}

export function setBuiltinBrowserMode(next: BuiltinBrowserMode): Promise<void> {
  const job = modeChain.then(() => applyBuiltinBrowserMode(next))
  modeChain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

export async function reinforceBuiltinBrowserViewport(): Promise<void> {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  pageView?.webContents.setBackgroundThrottling(false)
  const viewport = viewportForMode(mode, win.getBounds())
  await applyDeviceMetrics(viewport.width, viewport.height)
}

export function showBuiltinBrowserInactive(): void {
  if (mode === 'hidden') return
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
  if (titleBarRequestsRaise({ alive, visible, mode })) {
    win!.moveTop()
    win!.showInactive()
    publishUi()
    return
  }
  await setBuiltinBrowserMode('thumbnail')
}

export function destroyBuiltinBrowserWindow(): void {
  destroyAllowed = true
  const win = browserWindow
  browserWindow = null
  pageView = null
  overlayView = null
  mode = modeAfterEnsure()
  detached = false
  lastThumbBounds = null
  pageTitle = '内置浏览器'
  pageUrlLabel = '尚未打开页面'
  expectedBounds = null
  if (win && !win.isDestroyed()) win.destroy()
  publishUi()
  destroyAllowed = appQuitting
}

async function applyBuiltinBrowserMode(next: BuiltinBrowserMode): Promise<void> {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  mode = next
  detached = detachedAfterMode(detached, next)
  if (next !== 'hidden') forcedHides = 0
  pageView?.webContents.setBackgroundThrottling(false)

  if (next === 'hidden') {
    follow?.setVisibleBefore(false)
    if (!browserWindow || browserWindow.isDestroyed()) return
    browserWindow.hide()
    publishUi()
    const viewport = viewportForMode('hidden', THUMB)
    await applyDeviceMetrics(viewport.width, viewport.height)
    if (!browserWindow || browserWindow.isDestroyed()) return
    layoutViews('hidden', { x: 0, y: 0, width: THUMB.width, height: THUMB.height })
    return
  }

  const bounds = boundsFor(next)
  const viewport = viewportForMode(next, bounds)
  await applyDeviceMetrics(viewport.width, viewport.height)
  if (!browserWindow || browserWindow.isDestroyed()) return
  if (next === 'expanded') {
    layoutViews(next, bounds)
    applyBounds(bounds)
  } else {
    applyBounds(bounds)
    layoutViews(next, bounds)
  }
  presentFloatingWindow()
  publishUi()
}

function presentFloatingWindow(): void {
  const win = browserWindow
  if (!win || win.isDestroyed() || mode === 'hidden') return
  const main = win.getParentWindow()
  const blocked = !main || main.isDestroyed() || main.isMinimized() || !main.isVisible()
  if (blocked) {
    follow?.setVisibleBefore(true)
    return
  }
  win.showInactive()
}

function onBrowserShow(): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  if (mode === 'hidden' && !destroyAllowed && !appQuitting) {
    if (forcingHide || forcedHides > 4) return
    forcedHides += 1
    forcingHide = true
    try {
      win.hide()
    } finally {
      forcingHide = false
    }
    return
  }
  forcedHides = 0
  publishUi()
}

async function applyDeviceMetrics(width: number, height: number): Promise<void> {
  try {
    await sendPageCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    })
  } catch {
    // 视口度量失败不拆掉页面
  }
}

function boundsFor(next: BuiltinBrowserMode): ScreenRect {
  const main = browserWindow?.getParentWindow()
  const workArea = workAreaFor(main)
  if (next === 'expanded') return anchorExpanded(workArea)
  if (next === 'thumbnail' && detached && lastThumbBounds) {
    return {
      x: lastThumbBounds.x,
      y: lastThumbBounds.y,
      width: THUMB.width,
      height: THUMB.height,
    }
  }
  const mainBounds = main && !main.isDestroyed() ? main.getBounds() : workArea
  return anchorTopRight(mainBounds, THUMB, workArea)
}

function layoutViews(next: BuiltinBrowserMode, bounds: ScreenRect): void {
  if (pageView) {
    if (next === 'expanded') {
      pageView.setBounds({
        x: 0,
        y: CAPTION_HEIGHT,
        width: bounds.width,
        height: Math.max(0, bounds.height - CAPTION_HEIGHT),
      })
    } else {
      pageView.setBounds({ x: 0, y: 0, width: THUMB.width, height: THUMB.height })
    }
  }
  if (!overlayView) return
  if (showsThumbnailOverlay(next)) {
    overlayView.setBounds({ x: 0, y: 0, width: THUMB.width, height: THUMB.height })
    overlayView.setVisible(true)
    return
  }
  overlayView.setVisible(false)
  overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
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
    publishUi()
    return
  }
  pageUrlLabel = url
  const next = navigationMode(mode, url)
  if (next !== mode) {
    void setBuiltinBrowserMode(next)
    return
  }
  publishUi()
}

function publishUi(): void {
  const state = getBuiltinBrowserUiState()
  if (browserWindow && !browserWindow.isDestroyed()) {
    try {
      browserWindow.webContents.send(IPC.BUILTIN_BROWSER_CAPTION, {
        mode: state.mode,
        title: state.title,
        url: state.url,
      })
    } catch {
      // 标题条还没装上
    }
  }
  for (const listener of uiListeners) listener(state)
}

function near(actual: ScreenRect, expected: ScreenRect): boolean {
  return Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2
}

function captionPreloadPath(): string {
  return path.join(moduleDir, '../preload/caption.mjs')
}

function dataHtml(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}
