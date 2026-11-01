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
    assert.equal(tabs.tabs.value.length, 1)
    assert.equal(tabs.tabs.value[0]?.title, '线索库')
    assert.equal(tabs.tabs.value[0]?.id, 'page:leads')
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
    await tabs.closeTab('page:home')
    assert.equal(tabs.activeId.value, null)
    assert.equal(tabs.tabs.value.length, 0)
    assert.equal(pushes.at(-1)?.name, 'empty')
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
    assert.equal(tabs.tabs.value.length, 1)
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
    assert.equal(tabs.tabs.value.length, 0)
    assert.equal(tabs.activeId.value, null)
    assert.equal(tabs.settingsCover.value, true)
    assert.equal(pushes.at(-1)?.name, 'settings')
  })

  it('reuses one blank browser tab and opens another after that page has a url', async () => {
    const { tabs } = harness()
    await tabs.openUserBrowserTab()
    await tabs.openUserBrowserTab()
    assert.equal(tabs.tabs.value.length, 1)
    assert.equal(tabs.tabs.value[0]?.kind, 'browser')
    assert.equal(tabs.tabs.value[0]?.title, '浏览器')
    if (tabs.tabs.value[0]?.kind === 'browser') tabs.tabs.value[0].url = 'https://acme-industrial.com/products/valves'
    await tabs.openUserBrowserTab()
    assert.equal(tabs.tabs.value.length, 2)
    assert.equal(tabs.tabs.value[1]?.title, '浏览器')
    assert.equal(tabs.activeId.value, tabs.tabs.value[1]?.id)
  })
})
