import { computed, ref } from 'vue'
import { useRouter, type LocationQueryRaw, type Router } from 'vue-router'
import type { BuiltinBrowserTabsPayload } from '../types/electron'
import { showToast } from './useToast'

export type PageKey = 'home' | 'input' | 'profile' | 'explore' | 'leads' | 'email'

export const PAGE_TITLE: Record<PageKey, string> = {
  home: '首页',
  input: '产品录入',
  profile: '产品画像',
  explore: '获客探索',
  leads: '线索库',
  email: '邮件审核',
}

export const PAGE_COMPONENT: Record<PageKey, string> = {
  home: 'HomeView',
  input: 'InputView',
  profile: 'ProfileView',
  explore: 'ExploreView',
  leads: 'LeadsView',
  email: 'EmailView',
}

const BUSINESS_PAGES = new Set<PageKey>(['input', 'profile', 'explore', 'leads', 'email'])

export type BusinessPage = Exclude<PageKey, 'home'>

export interface PageTab {
  id: `page:${PageKey}`
  kind: 'page'
  page: PageKey
  title: string
}

export interface BrowserTab {
  id: string
  kind: 'browser'
  browserKey: string
  title: string
  url: string
  origin: 'user' | 'task'
  taskId: string | null
}

export type MainTab = PageTab | BrowserTab

export function isPageKey(value: string): value is PageKey {
  return value in PAGE_TITLE
}

export function isBusinessPage(page: PageKey): page is BusinessPage {
  return BUSINESS_PAGES.has(page)
}

function pageId(page: PageKey): `page:${PageKey}` {
  return `page:${page}`
}

function isBlankUserTab(tab: MainTab): boolean {
  return tab.kind === 'browser' && tab.origin === 'user' && (tab.url === '' || tab.url === 'about:blank')
}

function homeTab(): PageTab {
  return { id: 'page:home', kind: 'page', page: 'home', title: PAGE_TITLE.home }
}

function placeHomeFirst(list: MainTab[]): MainTab[] {
  const home = list.find((tab) => tab.id === 'page:home') ?? homeTab()
  return [home, ...list.filter((tab) => tab.id !== 'page:home')]
}

export function createMainViewTabs(router: Pick<Router, 'push'>) {
  const tabs = ref<MainTab[]>([homeTab()])
  const activeId = ref<string | null>(null)
  const settingsCover = ref(false)
  let browserSeq = 0

  const browserChrome = ref<Record<string, { canGoBack: boolean; canGoForward: boolean }>>({})
  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value) ?? null)
  const cachedViewNames = computed(() =>
    tabs.value.flatMap((tab) => (tab.kind === 'page' ? [PAGE_COMPONENT[tab.page]] : [])),
  )

  function routeFor(tab: MainTab, query?: LocationQueryRaw): { name: string; query?: LocationQueryRaw } {
    if (tab.kind === 'page') return { name: tab.page, query }
    return { name: 'browse' }
  }

  function focus(tab: MainTab, query?: LocationQueryRaw): Promise<unknown> {
    activeId.value = tab.id
    settingsCover.value = false
    return router.push(routeFor(tab, query))
  }

  function openPageTab(page: PageKey, query?: LocationQueryRaw): Promise<unknown> {
    const id = pageId(page)
    let tab = tabs.value.find((item) => item.id === id)
    if (!tab) {
      tab = { id, kind: 'page', page, title: PAGE_TITLE[page] }
      tabs.value.push(tab)
      tabs.value = placeHomeFirst(tabs.value)
    }
    return focus(tab, query)
  }

  /**
   * 空白用户页只占一枚。有主进程时 id 用 BrowserTab.key；单测里没有 IPC，仍在本地追加。
   */
  function openUserBrowserTab(): Promise<unknown> {
    const blank = tabs.value.find(isBlankUserTab)
    if (blank) return focus(blank)
    const open = browserHost()?.openBuiltinBrowserTab
    if (open) {
      return open().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast(message || '这一页没有打开。', { tone: 'error' })
      })
    }
    browserSeq += 1
    const id = `browser-${browserSeq}`
    const tab: BrowserTab = {
      id,
      kind: 'browser',
      browserKey: id,
      title: '浏览器',
      url: '',
      origin: 'user',
      taskId: null,
    }
    tabs.value.push(tab)
    tabs.value = placeHomeFirst(tabs.value)
    return focus(tab)
  }

  function applyPublishedTabs(payload: BuiltinBrowserTabsPayload): Promise<unknown> | undefined {
    const published = new Map(payload.tabs.map((tab) => [tab.browserKey, tab]))
    const previous = tabs.value
    const removedIds = new Set(
      previous.filter((tab) => tab.kind === 'browser' && !published.has(tab.browserKey)).map((tab) => tab.id),
    )
    const next: MainTab[] = []
    for (const tab of previous) {
      if (tab.kind === 'page') {
        next.push(tab)
        continue
      }
      const fresh = published.get(tab.browserKey)
      if (!fresh) continue
      next.push({
        ...tab,
        title: fresh.title,
        url: fresh.url,
        origin: fresh.origin,
        taskId: fresh.taskId,
      })
      published.delete(tab.browserKey)
    }
    for (const fresh of payload.tabs) {
      if (!published.has(fresh.browserKey)) continue
      next.push({
        id: fresh.browserKey,
        kind: 'browser',
        browserKey: fresh.browserKey,
        title: fresh.title,
        url: fresh.url,
        origin: fresh.origin,
        taskId: fresh.taskId,
      })
    }
    tabs.value = placeHomeFirst(next)
    const chrome: Record<string, { canGoBack: boolean; canGoForward: boolean }> = {}
    for (const fresh of payload.tabs) {
      chrome[fresh.browserKey] = { canGoBack: fresh.canGoBack, canGoForward: fresh.canGoForward }
    }
    browserChrome.value = chrome

    if (payload.focusKey && next.some((tab) => tab.id === payload.focusKey)) {
      const tab = next.find((item) => item.id === payload.focusKey)
      if (tab) return focus(tab)
    }
    if (!activeId.value || !removedIds.has(activeId.value)) return undefined
    const index = previous.findIndex((tab) => tab.id === activeId.value)
    let neighbor: MainTab | null = null
    for (let cursor = index + 1; cursor < previous.length; cursor += 1) {
      const candidate = previous[cursor]
      if (candidate && !removedIds.has(candidate.id)) {
        neighbor = next.find((tab) => tab.id === candidate.id) ?? null
        break
      }
    }
    if (!neighbor) {
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = previous[cursor]
        if (candidate && !removedIds.has(candidate.id)) {
          neighbor = next.find((tab) => tab.id === candidate.id) ?? null
          break
        }
      }
    }
    if (!neighbor) {
      activeId.value = null
      if (settingsCover.value) return undefined
      return router.push({ name: 'empty' })
    }
    activeId.value = neighbor.id
    if (settingsCover.value) return undefined
    return router.push(routeFor(neighbor))
  }

  function openSettings(): Promise<unknown> {
    settingsCover.value = true
    return router.push({ name: 'settings' })
  }

  function activateTab(id: string): Promise<unknown> | undefined {
    const tab = tabs.value.find((item) => item.id === id)
    if (!tab) return undefined
    return focus(tab)
  }

  function closeTab(id: string): Promise<unknown> | undefined {
    if (id === 'page:home') return undefined
    const current = tabs.value.find((tab) => tab.id === id)
    if (current?.kind === 'browser' && browserHost()?.closeBuiltinBrowserTab) {
      void browserHost()?.closeBuiltinBrowserTab(current.browserKey)
      return undefined
    }
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index < 0) return undefined
    const wasActive = activeId.value === id
    tabs.value.splice(index, 1)
    if (!wasActive) return undefined
    const next = tabs.value[index] ?? tabs.value[index - 1] ?? null
    if (!next) {
      activeId.value = null
      if (settingsCover.value) return undefined
      return router.push({ name: 'empty' })
    }
    activeId.value = next.id
    if (settingsCover.value) return undefined
    return router.push(routeFor(next))
  }

  return {
    tabs,
    activeId,
    activeTab,
    settingsCover,
    cachedViewNames,
    browserChrome,
    openPageTab,
    openUserBrowserTab,
    openSettings,
    activateTab,
    closeTab,
    applyPublishedTabs,
  }
}

export type MainViewTabs = ReturnType<typeof createMainViewTabs>

let shared: MainViewTabs | null = null

function browserHost(): Window['ftcs'] | null {
  if (typeof window === 'undefined') return null
  return window.ftcs ?? null
}

export function useMainViewTabs(): MainViewTabs {
  if (!shared) shared = createMainViewTabs(useRouter())
  return shared
}
