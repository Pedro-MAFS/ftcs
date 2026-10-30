import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it, beforeEach } from 'node:test'
import {
  BUILTIN_TAB_CAP,
  BUILTIN_TAB_CAP_MESSAGE,
  BUILTIN_TAB_RECLAIM_AT,
  beginBrowserTask,
  closeTaskTabs,
  endBrowserTask,
  getCurrentBrowserTaskId,
  openTabWithGuard,
  resetTabLifecycleForTests,
  setTabCloseHost,
  type LifecycleTab,
} from './tab-lifecycle.ts'

const CAP_MESSAGE = '内置浏览器标签已达上限，这一页没有打开。'

function seed(): LifecycleTab {
  return { id: 'seed', origin: 'seed', taskId: null }
}

function task(id: string, taskId = 'task-a'): LifecycleTab {
  return { id, origin: 'task', taskId }
}

function user(id: string): LifecycleTab {
  return { id, origin: 'user', taskId: null }
}

describe('tab lifecycle constants', () => {
  it('locks the product cap at 10 and the reclaim line at 5', () => {
    assert.equal(BUILTIN_TAB_CAP, 10)
    assert.equal(BUILTIN_TAB_RECLAIM_AT, 5)
    assert.equal(BUILTIN_TAB_CAP_MESSAGE, CAP_MESSAGE)
    const source = readFileSync(new URL('./tab-lifecycle.ts', import.meta.url), 'utf8')
    assert.match(source, /BUILTIN_TAB_CAP = 10/)
    assert.match(source, /BUILTIN_TAB_RECLAIM_AT = 5/)
    assert.doesNotMatch(source, /BUILTIN_TAB_CAP = 12/)
    assert.doesNotMatch(source, /BUILTIN_TAB_RECLAIM_AT = 10/)
    assert.doesNotMatch(source, /setBuiltinBrowserMode/)
  })

  it('reclaims before creating a tab and does not change browser mode while closing a task', () => {
    const source = readFileSync(new URL('./builtin-browser-window.ts', import.meta.url), 'utf8')
    const openStart = source.indexOf('async function openBrowserTabNow')
    const openEnd = source.indexOf('export async function closeTabsForTask')
    const openBody = source.slice(openStart, openEnd)
    assert.ok(openStart >= 0 && openEnd > openStart)
    const reclaimAt = openBody.indexOf('reclaimBeforeOpen')
    const createAt = openBody.indexOf('createBrowserTab')
    const waitAt = openBody.indexOf('waitForNewTarget')
    assert.ok(reclaimAt >= 0 && reclaimAt < createAt && createAt < waitAt)
    assert.match(openBody, /BUILTIN_TAB_CAP_MESSAGE/)
    const closeStart = source.indexOf('export async function closeTabsForTask')
    const closeEnd = source.indexOf('async function closeBrowserTab')
    const closeBody = source.slice(closeStart, closeEnd)
    assert.ok(closeStart >= 0 && closeEnd > closeStart)
    assert.doesNotMatch(closeBody, /setBuiltinBrowserMode/)
    assert.doesNotMatch(closeBody, /\.hide\(/)
    assert.doesNotMatch(closeBody, /\.show\(/)
    assert.match(source, /createBrowserTab\('seed', null\)/)
  })
})

describe('closeTaskTabs §3.1', () => {
  const taskId = 'task-a'

  it('drops five task tabs opened on top of the seed', () => {
    const ended = closeTaskTabs(
      [seed(), task('c1'), task('c2'), task('c3'), task('c4'), task('c5')],
      taskId,
    )
    assert.equal(ended.closed, 5)
    assert.equal(ended.remaining, 1)
    assert.deepEqual(ended.tabs, [seed()])
  })

  it('keeps the seed and drops company pages opened during the task', () => {
    const before = [seed()]
    let tabs = before.slice()
    for (let index = 0; index < 5; index += 1) {
      const opened = openTabWithGuard(tabs, `site-${index}`, taskId)
      assert.equal(opened.error, null)
      tabs = opened.tabs
    }
    const ended = closeTaskTabs(tabs, taskId)
    assert.equal(ended.closed, tabs.filter((tab) => tab.origin === 'task').length)
    assert.equal(ended.remaining, 1)
    assert.deepEqual(ended.tabs, [seed()])
  })

  it('keeps the seed and a user tab, and drops only this task', () => {
    let tabs: LifecycleTab[] = [seed(), user('manual')]
    for (let index = 0; index < 3; index += 1) {
      const opened = openTabWithGuard(tabs, `site-${index}`, taskId)
      assert.equal(opened.error, null)
      tabs = opened.tabs
    }
    const ended = closeTaskTabs(tabs, taskId)
    assert.equal(ended.remaining, 2)
    assert.deepEqual(
      ended.tabs.map((tab) => tab.id),
      ['seed', 'manual'],
    )
    assert.equal(ended.tabs.every((tab) => tab.origin !== 'task'), true)
  })

  it('leaves the seed alone when the task opened nothing', () => {
    const ended = closeTaskTabs([seed()], taskId)
    assert.equal(ended.closed, 0)
    assert.equal(ended.remaining, 1)
    assert.deepEqual(ended.tabs, [seed()])
  })

  it('reseeds the last page instead of closing every tab', () => {
    const ended = closeTaskTabs([task('only')], taskId)
    assert.equal(ended.closed, 0)
    assert.equal(ended.remaining, 1)
    assert.equal(ended.tabs[0]?.origin, 'seed')
    assert.equal(ended.tabs[0]?.taskId, null)
  })

  it('does not close another task id', () => {
    const ended = closeTaskTabs([seed(), task('other', 'task-b'), task('mine')], taskId)
    assert.deepEqual(
      ended.tabs.map((tab) => tab.id),
      ['seed', 'other'],
    )
  })
})

describe('openTabWithGuard §5.1', () => {
  const taskId = 'task-a'

  it('reclaims the oldest current-task tab once five tabs are open', () => {
    const tabs = [seed(), task('t0'), task('t1'), task('t2'), task('t3')]
    const opened = openTabWithGuard(tabs, 't4', taskId)
    assert.equal(opened.error, null)
    assert.equal(opened.tabs.length, 5)
    assert.equal(opened.tabs.some((tab) => tab.id === 't0'), false)
    assert.equal(opened.tabs.at(-1)?.id, 't4')
    assert.equal(opened.tabs.at(-1)?.origin, 'task')
    assert.equal(opened.tabs.at(-1)?.taskId, taskId)
  })

  it('keeps the count at or below 5 while opening past the reclaim line', () => {
    let tabs = [seed()]
    for (let index = 0; index < 12; index += 1) {
      const opened = openTabWithGuard(tabs, `site-${index}`, taskId)
      assert.equal(opened.error, null)
      tabs = opened.tabs
      assert.ok(tabs.length <= BUILTIN_TAB_RECLAIM_AT)
    }
    assert.equal(tabs.filter((tab) => tab.origin === 'task').length > 0, true)
    assert.equal(tabs[0]?.origin, 'seed')
  })

  it('rejects immediately when non-task tabs already fill the cap', () => {
    const tabs = [seed(), ...Array.from({ length: 9 }, (_, index) => user(`u${index}`))]
    assert.equal(tabs.length, 10)
    const started = Date.now()
    const opened = openTabWithGuard(tabs, 'blocked', taskId)
    const elapsed = Date.now() - started
    assert.equal(opened.opened, false)
    assert.equal(opened.error, CAP_MESSAGE)
    assert.equal(opened.tabs.length, 10)
    assert.deepEqual(opened.tabs, tabs)
    assert.ok(elapsed < 1000)
  })

  it('allows opening up to the cap when nothing from this task can be reclaimed', () => {
    let tabs = [seed(), user('u0'), user('u1'), user('u2')]
    assert.equal(tabs.length, 4)
    const opened = openTabWithGuard(tabs, 'first-task', taskId)
    assert.equal(opened.error, null)
    tabs = opened.tabs
    assert.equal(tabs.length, 5)
  })

  it('does not reclaim seed, user, or another task id', () => {
    const tabs = [
      seed(),
      user('u0'),
      user('u1'),
      user('u2'),
      task('other', 'task-b'),
    ]
    const opened = openTabWithGuard(tabs, 'mine', taskId)
    assert.equal(opened.error, null)
    assert.equal(opened.tabs.length, 6)
    assert.equal(opened.tabs.some((tab) => tab.id === 'other'), true)
    assert.equal(opened.tabs.some((tab) => tab.id === 'u0'), true)
  })
})

describe('endBrowserTask after reject', () => {
  beforeEach(() => {
    resetTabLifecycleForTests()
  })

  it('leaves the count unchanged when the rejected open had no task tabs', async () => {
    let tabs = [seed(), ...Array.from({ length: 9 }, (_, index) => user(`u${index}`))]
    setTabCloseHost(async (id) => {
      const result = closeTaskTabs(tabs, id)
      tabs = result.tabs
      return { closed: result.closed, remaining: result.remaining }
    })
    beginBrowserTask('browser-discover-leads-1')
    const opened = openTabWithGuard(tabs, 'blocked', getCurrentBrowserTaskId())
    assert.equal(opened.error, CAP_MESSAGE)
    tabs = opened.tabs
    const ended = await endBrowserTask('browser-discover-leads-1')
    assert.equal(ended.closed, 0)
    assert.equal(ended.remaining, 10)
    assert.equal(tabs.length, 10)
    assert.equal(getCurrentBrowserTaskId(), null)
  })

  it('clears this task id and keeps seed plus user tabs', async () => {
    let tabs = [seed(), user('manual'), task('a', 'browser-discover-leads-2'), task('b', 'browser-discover-leads-2')]
    setTabCloseHost(async (id) => {
      const result = closeTaskTabs(tabs, id)
      tabs = result.tabs
      return { closed: result.closed, remaining: result.remaining }
    })
    beginBrowserTask('browser-discover-leads-2')
    const ended = await endBrowserTask('browser-discover-leads-2')
    assert.equal(ended.closed, 2)
    assert.deepEqual(
      tabs.map((tab) => tab.id),
      ['seed', 'manual'],
    )
  })
})
