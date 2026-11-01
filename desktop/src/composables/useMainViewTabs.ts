import { computed, ref } from 'vue'
import { useRouter, type LocationQueryRaw, type Router } from 'vue-router'

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

export function createMainViewTabs(router: Pick<Router, 'push'>) {
  const tabs = ref<MainTab[]>([])
  const activeId = ref<string | null>(null)
  const settingsCover = ref(false)
  let browserSeq = 0

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
    }
    return focus(tab, query)
  }

  /**
   * 空白用户页只在标签列表里占一枚。WebContents 由 US-LY-03 创建，id 届时改用主进程的 BrowserTab.key。
   */
  function openUserBrowserTab(): Promise<unknown> {
    const blank = tabs.value.find(isBlankUserTab)
    if (blank) return focus(blank)
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
    return focus(tab)
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
    openPageTab,
    openUserBrowserTab,
    openSettings,
    activateTab,
    closeTab,
  }
}

export type MainViewTabs = ReturnType<typeof createMainViewTabs>

let shared: MainViewTabs | null = null

export function useMainViewTabs(): MainViewTabs {
  if (!shared) shared = createMainViewTabs(useRouter())
  return shared
}
