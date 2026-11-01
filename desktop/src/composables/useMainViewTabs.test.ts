import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LocationQueryRaw } from 'vue-router'
import { createMainViewTabs } from './useMainViewTabs.ts'

function harness() {
  const pushes: Array<{ name?: string | symbol; query?: LocationQueryRaw }> = []
  const tabs = createMainViewTabs({
    push(to) {
      if (typeof to === 'object' && to && 'name' in to) {
        pushes.push({ name: to.name, query: to.query })
      }
      return Promise.resolve()
    },
  })
  return { tabs, pushes }
}

describe('useMainViewTabs', () => {
  it('focuses an existing business tab instead of opening a second one', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('leads')
    await tabs.openPageTab('leads')
    assert.equal(tabs.tabs.value.length, 2)
    assert.equal(tabs.tabs.value[0]?.id, 'page:home')
    assert.equal(tabs.tabs.value[1]?.title, '线索库')
    assert.equal(tabs.tabs.value[1]?.id, 'page:leads')
    assert.equal(tabs.activeId.value, 'page:leads')
    assert.equal(pushes.length, 2)
    assert.equal(tabs.settingsCover.value, false)
  })

  it('activates the right neighbor when the current tab closes', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('home')
    await tabs.openPageTab('leads')
    await tabs.openPageTab('explore')
    await tabs.activateTab('page:leads')
    await tabs.closeTab('page:leads')
    assert.equal(tabs.activeId.value, 'page:explore')
    assert.deepEqual(
      tabs.tabs.value.map((tab) => tab.title),
      ['首页', '获客探索'],
    )
    assert.equal(pushes.at(-1)?.name, 'explore')

    await tabs.closeTab('page:explore')
    assert.equal(tabs.activeId.value, 'page:home')
    const pushesBefore = pushes.length
    await tabs.closeTab('page:home')
    assert.equal(tabs.activeId.value, 'page:home')
    assert.deepEqual(
      tabs.tabs.value.map((tab) => tab.id),
      ['page:home'],
    )
    assert.equal(pushes.length, pushesBefore)
  })

  it('leaves the current tab selected when closing another one', async () => {
    const { tabs } = harness()
    await tabs.openPageTab('home')
    await tabs.openPageTab('leads')
    await tabs.closeTab('page:leads')
    assert.equal(tabs.activeId.value, 'page:home')
    assert.equal(tabs.tabs.value.length, 1)
  })

  it('covers the main view with settings without adding a tab', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('leads')
    await tabs.openSettings()
    assert.equal(tabs.settingsCover.value, true)
    assert.equal(tabs.tabs.value.length, 2)
    assert.equal(tabs.activeId.value, 'page:leads')
    assert.equal(pushes.at(-1)?.name, 'settings')

    await tabs.activateTab('page:leads')
    assert.equal(tabs.settingsCover.value, false)
    assert.equal(pushes.at(-1)?.name, 'leads')
  })

  it('keeps settings on screen when the last tab closes', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('leads')
    await tabs.openSettings()
    await tabs.closeTab('page:leads')
    assert.equal(tabs.tabs.value.length, 1)
    assert.equal(tabs.tabs.value[0]?.id, 'page:home')
    assert.equal(tabs.activeId.value, 'page:home')
    assert.equal(tabs.settingsCover.value, true)
    assert.equal(pushes.at(-1)?.name, 'settings')
  })

  it('reuses one blank browser tab and opens another after that page has a url', async () => {
    const { tabs } = harness()
    await tabs.openUserBrowserTab()
    await tabs.openUserBrowserTab()
    assert.equal(tabs.tabs.value.length, 2)
    assert.equal(tabs.tabs.value[0]?.id, 'page:home')
    assert.equal(tabs.tabs.value[1]?.kind, 'browser')
    assert.equal(tabs.tabs.value[1]?.title, '浏览器')
    if (tabs.tabs.value[1]?.kind === 'browser') tabs.tabs.value[1].url = 'https://acme-industrial.com/products/valves'
    await tabs.openUserBrowserTab()
    assert.equal(tabs.tabs.value.length, 3)
    assert.equal(tabs.tabs.value[0]?.id, 'page:home')
    assert.equal(tabs.tabs.value[2]?.title, '浏览器')
    assert.equal(tabs.activeId.value, tabs.tabs.value[2]?.id)
  })

  it('appends a task browser tab without leaving the current page', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('leads')
    const before = pushes.length
    await tabs.applyPublishedTabs({
      focusKey: null,
      tabs: [
        {
          browserKey: 'tab-3',
          title: 'acme.com',
          url: 'https://acme.com/',
          origin: 'task',
          taskId: 'browser-discover-1',
          canGoBack: false,
          canGoForward: false,
        },
      ],
    })
    assert.equal(tabs.activeId.value, 'page:leads')
    assert.equal(pushes.length, before)
    assert.deepEqual(
      tabs.tabs.value.map((tab) => tab.title),
      ['首页', '线索库', 'acme.com'],
    )
  })

  it('focuses a browser tab opened from the page the user is viewing', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('leads')
    await tabs.applyPublishedTabs({
      focusKey: 'tab-4',
      tabs: [
        {
          browserKey: 'tab-4',
          title: '浏览器',
          url: 'https://acme.com/products',
          origin: 'user',
          taskId: null,
          canGoBack: false,
          canGoForward: false,
        },
      ],
    })
    assert.equal(tabs.activeId.value, 'tab-4')
    assert.equal(pushes.at(-1)?.name, 'browse')
  })

  it('activates the neighbor when the active browser tab disappears', async () => {
    const { tabs, pushes } = harness()
    await tabs.openPageTab('home')
    await tabs.applyPublishedTabs({
      focusKey: 'tab-3',
      tabs: [
        {
          browserKey: 'tab-3',
          title: 'acme.com',
          url: 'https://acme.com/',
          origin: 'user',
          taskId: null,
          canGoBack: false,
          canGoForward: false,
        },
      ],
    })
    await tabs.applyPublishedTabs({ focusKey: null, tabs: [] })
    assert.equal(tabs.activeId.value, 'page:home')
    assert.equal(pushes.at(-1)?.name, 'home')
    assert.equal(tabs.tabs.value.length, 1)
  })
})
