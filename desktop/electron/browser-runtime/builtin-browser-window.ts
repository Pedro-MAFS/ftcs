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
import { isAdoptableTabUrl } from './cdp-filter'
import {
  beginTabAdoption,
  endTabAdoption,
  listBrowserPageIds,
  listInternalTargets,
  registerBrowserPage,
  sendPageCommand,
  setBuiltinBrowserTabHost,
  tokenPageUrl,
  unregisterBrowserPage,
} from './cdp-gateway'
import type { BuiltinBrowserMode, BuiltinBrowserUiState, ScreenRect } from './types'
import { IPC } from '../ipc/types'
import {
  CHROME_COMMAND_PREFIX,
  detachedAfterMode,
  isBusinessNavigation,
  modeAfterEnsure,
  modeAfterUserDismiss,
  navigationMode,
  parseChromeCommand,
  showsThumbnailOverlay,
  titleBarRequestsRaise,
  viewportForMode,
  type ChromeCommand,
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
let dragOrigin: { screenX: number; screenY: number; x: number; y: number } | null = null

interface BrowserTab {
  key: string
  targetId: string | null
  view: WebContentsView
  title: string
  url: string
}

let tabs: BrowserTab[] = []
let activeTab: BrowserTab | null = null
let tabSeq = 0
let tabQueue: Promise<unknown> = Promise.resolve()

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

export function notePrimaryBrowserTarget(id: string | null): void {
  if (!id) return
  const tab = tabs[0]
  if (!tab || tab.targetId) return
  tab.targetId = id
  publishUi()
}

function createBrowserTab(): BrowserTab {
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
  view.webContents.setBackgroundThrottling(false)
  const tab: BrowserTab = {
    key: `tab-${++tabSeq}`,
    targetId: null,
    view,
    title: '内置浏览器',
    url: '',
  }
  bindBrowserTab(tab)
  tabs.push(tab)
  return tab
}

function bindBrowserTab(tab: BrowserTab): void {
  const contents = tab.view.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void openBrowserTab(url)
    return { action: 'deny' }
  })
  contents.on('page-title-updated', (_event, title) => {
    const next = title.trim()
    if (next) tab.title = next
    if (tab === activeTab && next) pageTitle = next
    publishUi()
  })
  const onUrl = (_event: unknown, url: string) => {
    tab.url = url
    if (tab === activeTab) applyPageUrl(url)
    else publishUi()
  }
  contents.on('did-navigate', (event, url) => {
    onUrl(event, url)
    if (!tab.targetId) return
    void sendPageCommand('Runtime.runIfWaitingForDebugger', {}, tab.targetId)
  })
  contents.on('did-navigate-in-page', onUrl)
  contents.on('did-finish-load', () => {
    if (!tab.targetId) return
    void sendPageCommand('Runtime.runIfWaitingForDebugger', {}, tab.targetId)
    void sendPageCommand('Page.setWebLifecycleState', { state: 'active' }, tab.targetId)
  })
  contents.once('destroyed', () => {
    if (tabs.includes(tab)) dropTab(tab)
  })
}

function openBrowserTab(url: string): Promise<{ id: string; url: string }> {
  const run = tabQueue.then(
    () => openBrowserTabNow(url),
    () => openBrowserTabNow(url),
  )
  tabQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function openBrowserTabNow(requested: string): Promise<{ id: string; url: string }> {
  const win = browserWindow
  if (!win || win.isDestroyed()) throw new Error('builtin page not ready')
  const loadedUrl = /^https?:\/\//i.test(requested) ? requested : 'about:blank'
  beginTabAdoption(loadedUrl)
  const before = new Set(listBrowserPageIds())
  let tab: BrowserTab | null = null
  try {
    for (const item of await listInternalTargets()) {
      if (item.id) before.add(item.id)
    }
    tab = createBrowserTab()
    win.contentView.addChildView(tab.view)
    selectTab(tab)
    try {
      await tab.view.webContents.loadURL(loadedUrl)
    } catch {
      // 加载失败也先认目标，随后打开网址会按自己的超时返回
    }
    const id = await waitForNewTarget(before, loadedUrl)
    if (!id) throw new Error('new tab did not appear')
    tab.targetId = id
    registerBrowserPage(id)
    publishUi()
    applyCurrentMetrics()
    return { id, url: loadedUrl }
  } catch (err) {
    for (const id of listBrowserPageIds()) {
      if (!before.has(id)) unregisterBrowserPage(id)
    }
    if (tab) dropTab(tab)
    throw err
  } finally {
    endTabAdoption()
  }
}

async function closeBrowserTab(id: string): Promise<boolean> {
  const tab = findTab(id)
  if (!tab || tabs.length <= 1) return false
  dropTab(tab)
  return true
}

async function activateBrowserTab(id: string): Promise<boolean> {
  const tab = findTab(id)
  if (!tab) return false
  selectTab(tab)
  return true
}

function registerTabHost(): void {
  setBuiltinBrowserTabHost({
    openTab: openBrowserTab,
    closeTab: closeBrowserTab,
    activateTab: activateBrowserTab,
  })
}

function findTab(id: string): BrowserTab | undefined {
  return tabs.find((tab) => tab.key === id || tab.targetId === id)
}

function selectTab(tab: BrowserTab): void {
  activeTab = tab
  pageView = tab.view
  if (tab.title.trim()) pageTitle = tab.title
  const win = browserWindow
  if (win && !win.isDestroyed()) {
    const bounds = mode === 'expanded' ? win.getBounds() : { x: 0, y: 0, width: THUMB.width, height: THUMB.height }
    layoutViews(mode, bounds)
  }
  applyPageUrl(tab.url || '')
  applyCurrentMetrics()
}

function dropTab(tab: BrowserTab): void {
  const index = tabs.indexOf(tab)
  if (index < 0) return
  const wasActive = activeTab === tab
  tabs.splice(index, 1)
  if (tab.targetId) unregisterBrowserPage(tab.targetId)
  const win = browserWindow
  if (win && !win.isDestroyed()) {
    try {
      win.contentView.removeChildView(tab.view)
    } catch {
      // 这一页已经不在窗口上
    }
  }
  if (!tab.view.webContents.isDestroyed()) {
    try {
      tab.view.webContents.close()
    } catch {
      // 页面已经关掉
    }
  }
  if (!wasActive) {
    publishUi()
    return
  }
  const next = tabs[Math.min(index, tabs.length - 1)]
  if (next) {
    selectTab(next)
    return
  }
  activeTab = null
  pageView = null
  pageTitle = '内置浏览器'
  pageUrlLabel = '尚未打开页面'
  publishUi()
}

async function waitForNewTarget(before: Set<string>, requested: string): Promise<string | null> {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const list = await listInternalTargets()
    const hit = list.find((item) => {
      if (item.type && item.type !== 'page') return false
      if (!item.id || before.has(item.id)) return false
      return isAdoptableTabUrl(item.url, requested)
    })
    if (hit?.id) return hit.id
    await delay(50)
  }
  return null
}

function tabLabel(tab: BrowserTab): string {
  const title = tab.title.trim()
  if (isBusinessNavigation(tab.url)) {
    if (title && title !== '内置浏览器') return title
    try {
      return new URL(tab.url).host || '内置浏览器'
    } catch {
      return title || '内置浏览器'
    }
  }
  return title || '内置浏览器'
}

function captionTabs(): Array<{ id: string; title: string; url: string; active: boolean }> {
  return tabs.map((tab) => ({
    id: tab.targetId || tab.key,
    title: tabLabel(tab),
    url: tab.url,
    active: tab === activeTab,
  }))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  const tab = createBrowserTab()
  win.contentView.addChildView(tab.view)
  activeTab = tab
  pageView = tab.view

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
  attachChromeCommands(overlay.webContents)
  attachChromeCommands(win.webContents)

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
  if (token) await tab.view.webContents.loadURL(token)
  registerTabHost()
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
  keepTabsAwake()
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
  tabs = []
  activeTab = null
  setBuiltinBrowserTabHost(null)
  mode = modeAfterEnsure()
  detached = false
  lastThumbBounds = null
  dragOrigin = null
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
  keepTabsAwake()

  if (next === 'hidden') {
    dragOrigin = null
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

function keepTabsAwake(): void {
  for (const tab of tabs) {
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.setBackgroundThrottling(false)
  }
}

function applyCurrentMetrics(): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  const frame = mode === 'expanded' ? win.getBounds() : THUMB
  const viewport = viewportForMode(mode, frame)
  void applyDeviceMetrics(viewport.width, viewport.height)
}

async function applyDeviceMetrics(width: number, height: number): Promise<void> {
  const ids = listBrowserPageIds()
  const targets = ids.length > 0 ? ids : [null]
  for (const id of targets) {
    try {
      await sendPageCommand('Page.setWebLifecycleState', { state: 'active' }, id)
      await sendPageCommand(
        'Emulation.setDeviceMetricsOverride',
        {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        },
        id,
      )
    } catch {
      // 视口度量失败不拆掉页面
    }
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
  const pageBounds =
    next === 'expanded'
      ? {
          x: 0,
          y: CAPTION_HEIGHT,
          width: bounds.width,
          height: Math.max(0, bounds.height - CAPTION_HEIGHT),
        }
      : {
          x: 0,
          y: CAPTION_HEIGHT,
          width: THUMB.width,
          height: Math.max(0, THUMB.height - CAPTION_HEIGHT),
        }
  if (overlayView) overlayView.setVisible(showsThumbnailOverlay(next))
  raiseActivePage()
  if (showsThumbnailOverlay(next)) raiseOverlay()
  for (const tab of tabs) tab.view.setBounds(pageBounds)
  if (!overlayView) return
  if (showsThumbnailOverlay(next)) {
    overlayView.setBounds({
      x: 0,
      y: CAPTION_HEIGHT,
      width: THUMB.width,
      height: Math.max(0, THUMB.height - CAPTION_HEIGHT),
    })
    return
  }
  overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
}

function raiseActivePage(): void {
  const win = browserWindow
  const view = activeTab?.view
  if (!win || win.isDestroyed() || !view) return
  try {
    win.contentView.removeChildView(view)
    win.contentView.addChildView(view)
  } catch {
    // 当前页已经在最上面
  }
}

function raiseOverlay(): void {
  const win = browserWindow
  const overlay = overlayView
  if (!win || win.isDestroyed() || !overlay) return
  try {
    win.contentView.removeChildView(overlay)
    win.contentView.addChildView(overlay)
  } catch {
    // 蒙层已经盖在页面上
  }
}

function attachChromeCommands(contents: WebContents): void {
  contents.on('console-message', (...args: unknown[]) => {
    const command = parseChromeCommand(consoleText(args))
    if (command) handleChromeCommand(command)
  })
}

function consoleText(args: unknown[]): string {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.includes(CHROME_COMMAND_PREFIX)) return arg
  }
  for (const arg of args) {
    if (!arg || typeof arg !== 'object' || !('message' in arg)) continue
    const message = (arg as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

function handleChromeCommand(command: ChromeCommand): void {
  if (command.type === 'mode') {
    dragOrigin = null
    void setBuiltinBrowserMode(command.mode)
    return
  }
  if (command.type === 'select-tab') {
    const tab = findTab(command.id)
    if (tab) selectTab(tab)
    return
  }
  if (command.type === 'close-tab') {
    void closeBrowserTab(command.id)
    return
  }
  if (mode !== 'thumbnail') return
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  if (command.type === 'drag-start') {
    const bounds = win.getBounds()
    dragOrigin = {
      screenX: command.screenX,
      screenY: command.screenY,
      x: bounds.x,
      y: bounds.y,
    }
    return
  }
  if (command.type === 'drag-move' && dragOrigin) {
    const bounds = {
      x: Math.round(dragOrigin.x + command.screenX - dragOrigin.screenX),
      y: Math.round(dragOrigin.y + command.screenY - dragOrigin.screenY),
      width: THUMB.width,
      height: THUMB.height,
    }
    detached = true
    lastThumbBounds = bounds
    applyBounds(bounds)
    return
  }
  if (command.type === 'drag-end') dragOrigin = null
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
  const caption = {
    mode: state.mode,
    title: state.title,
    url: state.url,
    tabs: captionTabs(),
  }
  const win = browserWindow
  if (win && !win.isDestroyed()) {
    const payload = JSON.stringify(caption)
    void win.webContents
      .executeJavaScript(`window.__ftcsCaptionRender && window.__ftcsCaptionRender(${payload})`)
      .catch(() => {
        // 标题条还没装上
      })
    try {
      win.webContents.send(IPC.BUILTIN_BROWSER_CAPTION, caption)
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
