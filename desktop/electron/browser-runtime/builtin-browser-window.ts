import {
  app,
  BrowserWindow,
  WebContentsView,
  screen,
  type WebContents,
} from 'electron'
import { CAPTION_HEIGHT, THUMB, anchorExpanded, anchorTopRight } from './anchor'
import { browserTabTitles } from './browser-tab-title'
import { type MainWindowFollowController } from './follow-main-window'
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
import type {
  BuiltinBrowserMode,
  BuiltinBrowserSlot,
  BuiltinBrowserTabsPayload,
  BuiltinBrowserUiState,
  ScreenRect,
} from './types'
import { IPC } from '../ipc/types'
import {
  CHROME_COMMAND_PREFIX,
  detachedAfterMode,
  isBusinessNavigation,
  modeAfterEnsure,
  parseChromeCommand,
  showsThumbnailOverlay,
  shouldRepaintBuiltinBrowser,
  titleBarRequestsRaise,
  viewportForMode,
  type ChromeCommand,
} from './window-policy'
import {
  BUILTIN_TAB_CAP_MESSAGE,
  closeTaskTabs,
  getCurrentBrowserTaskId,
  reclaimBeforeOpen,
  setTabCloseHost,
  type TabOrigin,
} from './tab-lifecycle'

/** 与放大标题条一致的实色。WebContentsView 默认是白底，失焦后合成层丢掉就会露白。 */
const BROWSER_CHROME_BG = '#1A1A1A'
/** 缩略蒙层必须透出页面。alpha 为 0 时，获焦后若退回默认白底，会整页盖成白。 */
const OVERLAY_CHROME_BG = '#00000000'

let repaintGeneration = 0
/** 切模式的 await 期间不要改外框，避免和正在进行的 layout 抢尺寸。 */
let applyingBrowserMode = false
/** 主窗和浏览窗都不在前台之后才做合成微扰，避免在两个窗之间点一下就抖。 */
let builtinBrowserCompositorStale = false
/** 微扰的 48ms 补绘还没跑完时，普通 invalidate 不能把它顶掉。 */
let nudgeFollowupPending = false
/** setBounds ±1 触发的 moved 不要把缩略窗记成用户拖走。 */
let ignoreBuiltinBrowserMoveUntil = 0
/** 第一帧合成层可能还没回来，约三帧后再补一次。 */
const REPAINT_FOLLOWUP_MS = 48

const allowedWebContents = new Set<number>()
let constructing = 0
let guardInstalled = false
let destroyAllowed = false
let appQuitting = false

let browserWindow: BrowserWindow | null = null
/** 网页 view 的父级。用户路径是主窗口，不再另开一扇浏览窗。 */
let hostWindow: BrowserWindow | null = null
let slotBounds: ScreenRect | null = null
let shownBrowserKey: string | null = null
let focusKey: string | null = null
const FALLBACK_SLOT: ScreenRect = { x: 0, y: 0, width: 800, height: 600 }
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
  origin: TabOrigin
  taskId: string | null
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
  return Boolean(hostWindow && !hostWindow.isDestroyed() && tabs.some((tab) => tab.origin === 'seed'))
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

function createBrowserTab(origin: TabOrigin, taskId: string | null): BrowserTab {
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
  applyPageChrome(view)
  const tab: BrowserTab = {
    key: `tab-${++tabSeq}`,
    targetId: null,
    view,
    title: '内置浏览器',
    url: '',
    origin,
    taskId,
  }
  bindBrowserTab(tab)
  tabs.push(tab)
  return tab
}

function bindBrowserTab(tab: BrowserTab): void {
  const contents = tab.view.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void openBrowserTab(url, { focus: true })
    return { action: 'deny' }
  })
  contents.on('page-title-updated', (_event, title) => {
    const next = title.trim()
    if (tab === activeTab && next) pageTitle = next
    publishUi()
  })
  const onUrl = (_event: unknown, url: string) => {
    tab.url = url
    if (tab === activeTab) pageUrlLabel = displayUrl(url)
    publishMainTabs()
    publishUi()
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

function openBrowserTab(
  url: string,
  options: { focus: boolean; forceUser?: boolean },
): Promise<{ id: string; url: string; key: string }> {
  const run = tabQueue.then(
    () => openBrowserTabNow(url, options),
    () => openBrowserTabNow(url, options),
  )
  tabQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function openUserBuiltinBrowserTab(): Promise<{ key: string }> {
  return openBrowserTab('about:blank', { focus: true, forceUser: true }).then((opened) => ({
    key: opened.key,
  }))
}

async function openBrowserTabNow(
  requested: string,
  options: { focus: boolean; forceUser?: boolean },
): Promise<{ id: string; url: string; key: string }> {
  const host = hostWindow
  if (!host || host.isDestroyed()) throw new Error('builtin page not ready')
  const taskId = options.forceUser ? null : getCurrentBrowserTaskId()
  const plan = reclaimBeforeOpen(
    tabs.map((tab) => ({ id: tab.key, origin: tab.origin, taskId: tab.taskId })),
    taskId,
  )
  for (const id of plan.droppedIds) {
    const stale = tabs.find((tab) => tab.key === id)
    if (stale) dropTab(stale)
  }
  if (plan.reject) throw new Error(BUILTIN_TAB_CAP_MESSAGE)
  const loadedUrl = /^https?:\/\//i.test(requested) ? requested : 'about:blank'
  beginTabAdoption(loadedUrl)
  const before = new Set(listBrowserPageIds())
  let tab: BrowserTab | null = null
  try {
    for (const item of await listInternalTargets()) {
      if (item.id) before.add(item.id)
    }
    tab = createBrowserTab(taskId ? 'task' : 'user', taskId)
    host.contentView.addChildView(tab.view)
    placeView(tab.view, false)
    if (options.focus) focusKey = tab.key
    try {
      await tab.view.webContents.loadURL(loadedUrl)
    } catch {
      // 加载失败也先认目标，随后打开网址会按自己的超时返回
    }
    const id = await waitForNewTarget(before, loadedUrl)
    if (!id) throw new Error('new tab did not appear')
    tab.targetId = id
    registerBrowserPage(id)
    publishMainTabs()
    publishUi()
    applyCurrentMetrics()
    return { id, url: loadedUrl, key: tab.key }
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

export async function closeTabsForTask(
  taskId: string,
): Promise<{ closed: number; remaining: number }> {
  const planned = closeTaskTabs(
    tabs.map((tab) => ({ id: tab.key, origin: tab.origin, taskId: tab.taskId })),
    taskId,
  )
  const keep = new Set(planned.tabs.map((tab) => tab.id))
  for (const tab of tabs.filter((item) => !keep.has(item.key))) {
    dropTab(tab)
  }
  for (const record of planned.tabs) {
    const tab = tabs.find((item) => item.key === record.id)
    if (!tab) continue
    const becameSeed = tab.origin !== 'seed' && record.origin === 'seed'
    tab.origin = record.origin
    tab.taskId = record.taskId
    if (!becameSeed) continue
    tab.title = '内置浏览器'
    const token = tokenPageUrl()
    if (token) {
      try {
        await tab.view.webContents.loadURL(token)
      } catch {
        // 令牌页加载失败时仍保留这枚页
      }
      tab.url = token
    }
    if (activeTab === tab) {
      pageTitle = '内置浏览器'
      pageUrlLabel = '尚未打开页面'
      publishUi()
    }
  }
  publishMainTabs()
  return { closed: planned.closed, remaining: tabs.length }
}

export async function closeBrowserTab(id: string): Promise<boolean> {
  const tab = findTab(id)
  if (!tab || tabs.length <= 1) return false
  dropTab(tab)
  return true
}

async function activateBrowserTab(id: string): Promise<boolean> {
  const tab = findTab(id)
  if (!tab) return false
  activeTab = tab
  pageView = tab.view
  return true
}

function registerTabHost(): void {
  setBuiltinBrowserTabHost({
    openTab: (url) => openBrowserTab(url, { focus: false }),
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
  const win = hostWindow
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
  if (shownBrowserKey === tab.key) {
    shownBrowserKey = null
    for (const item of tabs) placeView(item.view, false)
  }
  if (wasActive) {
    activeTab = tabs[Math.min(index, tabs.length - 1)] ?? null
    pageView = activeTab?.view ?? null
    if (!activeTab) {
      pageTitle = '内置浏览器'
      pageUrlLabel = '尚未打开页面'
    }
  }
  publishMainTabs()
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
  if (hostWindow && !hostWindow.isDestroyed() && tabs.some((tab) => tab.origin === 'seed')) return false
  hostWindow = main
  mode = modeAfterEnsure()
  const tab = createBrowserTab('seed', null)
  main.contentView.addChildView(tab.view)
  placeView(tab.view, false)
  activeTab = tab
  pageView = tab.view
  const token = tokenPageUrl()
  if (token) await tab.view.webContents.loadURL(token)
  registerTabHost()
  publishMainTabs()
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
  if (win && !win.isDestroyed()) {
    keepTabsAwake()
    const viewport = viewportForMode(mode, win.getBounds())
    await applyDeviceMetrics(viewport.width, viewport.height)
    return
  }
  if (!hostWindow || hostWindow.isDestroyed()) return
  keepTabsAwake()
  const bounds = boundsForViews()
  await applyDeviceMetrics(bounds.width, bounds.height)
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
  const host = hostWindow
  hostWindow = null
  for (const tab of tabs) {
    if (host && !host.isDestroyed()) {
      try {
        host.contentView.removeChildView(tab.view)
      } catch {
        // 这一页已经不在主窗口上
      }
    }
    if (!tab.view.webContents.isDestroyed()) {
      try {
        tab.view.webContents.close()
      } catch {
        // 页面已经关掉
      }
    }
  }
  const win = browserWindow
  browserWindow = null
  pageView = null
  overlayView = null
  tabs = []
  activeTab = null
  slotBounds = null
  shownBrowserKey = null
  focusKey = null
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
  applyingBrowserMode = true
  try {
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
  } finally {
    applyingBrowserMode = false
  }
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
  scheduleBuiltinBrowserPaint()
}

function keepTabsAwake(): void {
  const win = browserWindow
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.setBackgroundThrottling(false)
  }
  if (overlayView && !overlayView.webContents.isDestroyed()) {
    overlayView.webContents.setBackgroundThrottling(false)
  }
  for (const tab of tabs) {
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.setBackgroundThrottling(false)
  }
}

/**
 * 切出再切回时，Windows DWM 会丢掉子 WebContentsView 的合成层。
 * invalidate 只把还在的层标脏；层已经没了，页面和透明蒙层都会露出默认白底。
 * 应用真正离开前台再回来时，除了重刷底色，再做一次不抢焦点的合成微扰：
 * 窗口和子视图高度 ±1px 后回到微扰前的外框，透明度先到 0.99，约 48ms 再回到 1，
 * 并按当前 mode 重新 layoutViews。不 show / hide、不 focus、不改三态、不重新加载页面。
 * 收起和不可见不走这里。主窗和浏览窗之间切换只 invalidate。打开窗口也不做微扰。
 */
function noteBuiltinBrowserBackgrounded(): void {
  setTimeout(() => {
    if (builtinBrowserInForeground()) return
    builtinBrowserCompositorStale = true
  }, 0)
}

function builtinBrowserInForeground(): boolean {
  const win = browserWindow
  if (win && !win.isDestroyed() && win.isFocused()) return true
  const main = win && !win.isDestroyed() ? win.getParentWindow() : null
  return Boolean(main && !main.isDestroyed() && main.isFocused())
}

function scheduleBuiltinBrowserRepaint(): void {
  const nudge = builtinBrowserCompositorStale
  if (nudge) builtinBrowserCompositorStale = false
  scheduleBuiltinBrowserSurface(nudge)
}

function scheduleBuiltinBrowserPaint(): void {
  scheduleBuiltinBrowserSurface(false)
}

function scheduleBuiltinBrowserSurface(nudge: boolean): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  if (!shouldRepaintBuiltinBrowser({ mode, visible: win.isVisible() })) return
  if (!nudge && nudgeFollowupPending) return
  const generation = ++repaintGeneration
  nudgeFollowupPending = nudge
  repaintBuiltinBrowserSurface(nudge ? 'now' : 'paint')
  setTimeout(() => {
    if (generation !== repaintGeneration) return
    nudgeFollowupPending = false
    const current = browserWindow
    if (!current || current.isDestroyed() || current !== win) return
    if (shouldRepaintBuiltinBrowser({ mode, visible: current.isVisible() })) {
      repaintBuiltinBrowserSurface(nudge ? 'followup' : 'paint')
    }
    // 这一轮如果把透明度降到过 0.99，这里收回来。没降过再设回 1 也无妨。
    restoreBuiltinBrowserOpacity(current)
  }, REPAINT_FOLLOWUP_MS)
}

function repaintBuiltinBrowserSurface(phase: 'now' | 'followup' | 'paint'): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  if (!shouldRepaintBuiltinBrowser({ mode, visible: win.isVisible() })) return
  keepTabsAwake()
  applyBuiltinBrowserRepaintChrome(win)
  if (phase === 'paint' || process.platform !== 'win32') return
  nudgeBuiltinBrowserCompositor(win, phase)
  applyBuiltinBrowserRepaintChrome(win)
}

function applyBuiltinBrowserRepaintChrome(win: BrowserWindow): void {
  try {
    win.setBackgroundColor(BROWSER_CHROME_BG)
  } catch {
    // 窗正在销毁
  }
  refreshBuiltinBrowserContents(win.webContents)
  for (const tab of tabs) {
    applyPageChrome(tab.view)
    refreshBuiltinBrowserContents(tab.view.webContents)
  }
  applyOverlayChrome()
  if (overlayView) refreshBuiltinBrowserContents(overlayView.webContents)
}

function nudgeBuiltinBrowserCompositor(win: BrowserWindow, phase: 'now' | 'followup'): void {
  if (applyingBrowserMode || dragOrigin) return
  const restore = currentCompositorBounds(win)
  if (!restore) return
  ignoreBuiltinBrowserMoveUntil = Date.now() + REPAINT_FOLLOWUP_MS + 32
  try {
    win.setBounds({
      x: restore.x,
      y: restore.y,
      width: restore.width,
      height: restore.height + 1,
    })
    win.setBounds(restore)
  } catch {
    // 窗正在销毁
  }
  bumpBuiltinBrowserViewSurfaces()
  if (phase === 'now') {
    try {
      win.setOpacity(0.99)
    } catch {
      // 透明度微扰失败仍继续排版
    }
  }
  try {
    layoutViews(mode, restore)
  } catch {
    // 重新排版失败时，底色和 invalidate 仍保留
  }
}

function currentCompositorBounds(win: BrowserWindow): ScreenRect | null {
  try {
    const live = win.getBounds()
    if (live.width < 1 || live.height < 1) return null
    // 微扰前的外框。设回去，避免把 +1 写进 expectedBounds，也不要把窗拉回旧锚点。
    return {
      x: live.x,
      y: live.y,
      width: live.width,
      height: live.height,
    }
  } catch {
    return null
  }
}

function bumpBuiltinBrowserViewSurfaces(): void {
  for (const tab of tabs) bumpBuiltinBrowserViewSurface(tab.view)
  if (overlayView && showsThumbnailOverlay(mode)) bumpBuiltinBrowserViewSurface(overlayView)
}

function bumpBuiltinBrowserViewSurface(view: WebContentsView): void {
  if (view.webContents.isDestroyed()) return
  try {
    const bounds = view.getBounds()
    if (bounds.width < 1 || bounds.height < 1) return
    view.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height + 1,
    })
    view.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
  } catch {
    // 这一页正在关闭
  }
}

function restoreBuiltinBrowserOpacity(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  try {
    win.setOpacity(1)
  } catch {
    // 窗正在销毁
  }
}

function refreshBuiltinBrowserContents(contents: WebContents): void {
  if (contents.isDestroyed()) return
  try {
    contents.invalidate()
  } catch {
    // 这一帧没排上，下一轮获焦还会再试
  }
}

function applyPageChrome(view: WebContentsView): void {
  if (view.webContents.isDestroyed()) return
  try {
    view.setBackgroundColor(BROWSER_CHROME_BG)
    view.webContents.setBackgroundThrottling(false)
  } catch {
    // 页面底色失败仍保留这一页
  }
}

function applyOverlayChrome(): void {
  const overlay = overlayView
  if (!overlay || overlay.webContents.isDestroyed()) return
  try {
    overlay.setBackgroundColor(OVERLAY_CHROME_BG)
    overlay.webContents.setBackgroundThrottling(false)
  } catch {
    // 透明底失败时缩略页会被蒙层挡住，不因此拆掉窗口
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
  pageUrlLabel = displayUrl(url)
  publishMainTabs()
  publishUi()
}

function displayUrl(url: string): string {
  if (!url || url.includes('/__ftcs_builtin_page__') || url.startsWith('about:')) return '尚未打开页面'
  return url
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

function boundsForViews(): ScreenRect {
  return slotBounds ?? FALLBACK_SLOT
}

function placeView(view: WebContentsView, visible: boolean): void {
  if (view.webContents.isDestroyed()) return
  try {
    view.setBounds(boundsForViews())
    view.setVisible(visible)
  } catch {
    // 页面正在关闭
  }
}

export function setBuiltinBrowserSlot(input: BuiltinBrowserSlot): void {
  const host = hostWindow
  if (!host || host.isDestroyed()) return
  const visible = input.visible && !host.isMinimized()
  if (input.width > 0 && input.height > 0) {
    slotBounds = {
      x: Math.round(input.x),
      y: Math.round(input.y),
      width: Math.round(input.width),
      height: Math.round(input.height),
    }
  }
  shownBrowserKey = visible && input.browserKey ? input.browserKey : null
  for (const tab of tabs) {
    placeView(tab.view, tab.origin !== 'seed' && tab.key === shownBrowserKey)
  }
}

export function navigateBuiltinBrowser(key: string, raw: string): Promise<boolean> {
  const tab = tabs.find((item) => item.key === key && item.origin !== 'seed')
  if (!tab || tab.view.webContents.isDestroyed()) return Promise.resolve(false)
  const url = normalizeNavigationUrl(raw)
  if (!url) return Promise.resolve(false)
  return tab.view.webContents
    .loadURL(url)
    .then(() => true)
    .catch(() => true)
}

export function controlBuiltinBrowser(key: string, action: 'back' | 'forward' | 'reload'): void {
  const tab = tabs.find((item) => item.key === key && item.origin !== 'seed')
  if (!tab || tab.view.webContents.isDestroyed()) return
  const contents = tab.view.webContents
  if (action === 'back' && contents.canGoBack()) contents.goBack()
  else if (action === 'forward' && contents.canGoForward()) contents.goForward()
  else if (action === 'reload') contents.reload()
}

export function getBuiltinBrowserTabs(): BuiltinBrowserTabsPayload {
  return mainTabsPayload(false)
}

function publishMainTabs(): void {
  const host = hostWindow
  if (!host || host.isDestroyed()) return
  const payload = mainTabsPayload(true)
  try {
    host.webContents.send(IPC.BUILTIN_BROWSER_TABS, payload)
  } catch {
    // 主窗正在关
  }
}

function mainTabsPayload(includeFocus: boolean): BuiltinBrowserTabsPayload {
  const visible = tabs.filter((tab) => tab.origin === 'user' || tab.origin === 'task')
  const titles = browserTabTitles(visible.map((tab) => ({ key: tab.key, url: tab.url })))
  const payload: BuiltinBrowserTabsPayload = {
    tabs: visible.map((tab) => ({
      browserKey: tab.key,
      title: titles.get(tab.key) ?? '浏览器',
      url: tab.url,
      origin: tab.origin === 'task' ? 'task' : 'user',
      taskId: tab.taskId,
      canGoBack: !tab.view.webContents.isDestroyed() && tab.view.webContents.canGoBack(),
      canGoForward: !tab.view.webContents.isDestroyed() && tab.view.webContents.canGoForward(),
    })),
    focusKey: includeFocus ? focusKey : null,
  }
  if (includeFocus) focusKey = null
  return payload
}

function normalizeNavigationUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

setTabCloseHost((taskId) => closeTabsForTask(taskId))
