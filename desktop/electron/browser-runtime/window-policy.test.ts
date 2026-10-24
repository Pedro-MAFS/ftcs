import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  INITIAL_VISIBLE_BEFORE,
  builtinBrowserEntryLabel,
  detachedAfterMode,
  isBuiltinBrowserMode,
  isBusinessNavigation,
  modeAfterEnsure,
  modeAfterUserDismiss,
  navigationMode,
  shouldFollowMainAnchor,
  shouldRestoreFloatingWindow,
  showsThumbnailOverlay,
  titleBarRequestsRaise,
  viewportForMode,
  visibleBeforeAfterMainHide,
} from './window-policy.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

function read(rel: string): string {
  return readFileSync(path.join(here, rel), 'utf8')
}

test('cold start and dismiss both stay hidden', () => {
  assert.equal(modeAfterEnsure(), 'hidden')
  assert.equal(modeAfterUserDismiss(), 'hidden')
  assert.equal(INITIAL_VISIBLE_BEFORE, false)
})

test('business navigation leaves the token page only while hidden', () => {
  const token = 'http://127.0.0.1:43123/__ftcs_builtin_page__'
  assert.equal(isBusinessNavigation(token), false)
  assert.equal(isBusinessNavigation('about:blank'), false)
  assert.equal(isBusinessNavigation(''), false)
  assert.equal(isBusinessNavigation('file:///tmp/a.html'), false)
  assert.equal(isBusinessNavigation('https://northline.example/about'), true)
  assert.equal(navigationMode('hidden', token), 'hidden')
  assert.equal(navigationMode('hidden', 'about:blank'), 'hidden')
  assert.equal(navigationMode('hidden', 'https://northline.example'), 'thumbnail')
  assert.equal(navigationMode('thumbnail', 'https://other.example'), 'thumbnail')
  assert.equal(navigationMode('expanded', 'https://other.example'), 'expanded')
})

test('dismiss keeps a dragged thumbnail position and expand clears it', () => {
  assert.equal(detachedAfterMode(true, 'hidden'), true)
  assert.equal(detachedAfterMode(false, 'hidden'), false)
  assert.equal(detachedAfterMode(true, 'thumbnail'), true)
  assert.equal(detachedAfterMode(true, 'expanded'), false)
})

test('hidden and thumbnail keep a 360x240 viewport; expand subtracts the caption', () => {
  assert.deepEqual(viewportForMode('hidden', { width: 1824, height: 984 }), {
    width: 360,
    height: 240,
  })
  assert.deepEqual(viewportForMode('thumbnail', { width: 360, height: 240 }), {
    width: 360,
    height: 240,
  })
  assert.deepEqual(viewportForMode('expanded', { width: 1824, height: 984 }), {
    width: 1824,
    height: 944,
  })
  assert.equal(viewportForMode('expanded', { width: 400, height: 10 }).height, 1)
})

test('only the thumbnail shows the overlay', () => {
  assert.equal(showsThumbnailOverlay('thumbnail'), true)
  assert.equal(showsThumbnailOverlay('hidden'), false)
  assert.equal(showsThumbnailOverlay('expanded'), false)
})

test('title bar copy follows visibility, not a floating status strip', () => {
  const hidden = { alive: true, visible: false, mode: 'hidden' as const }
  assert.equal(builtinBrowserEntryLabel(hidden), '打开浏览窗')
  assert.equal(titleBarRequestsRaise(hidden), false)
  assert.equal(
    builtinBrowserEntryLabel({ alive: true, visible: true, mode: 'hidden' }),
    '打开浏览窗',
  )
  assert.equal(
    builtinBrowserEntryLabel({ alive: true, visible: false, mode: 'thumbnail' }),
    '打开浏览窗',
  )
  assert.equal(
    builtinBrowserEntryLabel({ alive: true, visible: true, mode: 'thumbnail' }),
    '浏览中',
  )
  assert.equal(
    builtinBrowserEntryLabel({ alive: true, visible: true, mode: 'expanded' }),
    '浏览中',
  )
  assert.equal(titleBarRequestsRaise({ alive: true, visible: true, mode: 'expanded' }), true)
  assert.equal(titleBarRequestsRaise({ alive: false, visible: false, mode: 'thumbnail' }), false)
  assert.equal(builtinBrowserEntryLabel({ alive: false, visible: false, mode: 'thumbnail' }), '打开浏览窗')
})

test('main-window restore does not pop a hidden browser', () => {
  assert.equal(visibleBeforeAfterMainHide(true, false), true)
  assert.equal(visibleBeforeAfterMainHide(false, false), false)
  assert.equal(visibleBeforeAfterMainHide(false, true), true)
  assert.equal(
    shouldRestoreFloatingWindow({
      mainMinimized: false,
      mainVisible: true,
      mode: 'hidden',
      visibleBefore: true,
    }),
    false,
  )
  assert.equal(
    shouldRestoreFloatingWindow({
      mainMinimized: false,
      mainVisible: true,
      mode: 'thumbnail',
      visibleBefore: false,
    }),
    false,
  )
  assert.equal(
    shouldRestoreFloatingWindow({
      mainMinimized: false,
      mainVisible: true,
      mode: 'thumbnail',
      visibleBefore: true,
    }),
    true,
  )
  assert.equal(
    shouldRestoreFloatingWindow({
      mainMinimized: true,
      mainVisible: true,
      mode: 'expanded',
      visibleBefore: true,
    }),
    false,
  )
  assert.equal(
    shouldRestoreFloatingWindow({
      mainMinimized: false,
      mainVisible: true,
      mode: 'expanded',
      visibleBefore: true,
    }),
    true,
  )
})

test('only an attached thumbnail follows the main window', () => {
  assert.equal(shouldFollowMainAnchor({ detached: false, mode: 'thumbnail' }), true)
  assert.equal(shouldFollowMainAnchor({ detached: true, mode: 'thumbnail' }), false)
  assert.equal(shouldFollowMainAnchor({ detached: false, mode: 'expanded' }), false)
  assert.equal(shouldFollowMainAnchor({ detached: false, mode: 'hidden' }), false)
})

test('mode channel rejects the removed status strip', () => {
  assert.equal(isBuiltinBrowserMode('hidden'), true)
  assert.equal(isBuiltinBrowserMode('thumbnail'), true)
  assert.equal(isBuiltinBrowserMode('expanded'), true)
  assert.equal(isBuiltinBrowserMode('card'), false)
  assert.equal(isBuiltinBrowserMode(''), false)
})

test('T9 sources have no card mode and no 360x40 floating frame', () => {
  const modeLine = "export type BuiltinBrowserMode = 'hidden' | 'thumbnail' | 'expanded'"
  for (const rel of ['./types.ts', '../ipc/types.ts', '../../src/types/electron.d.ts']) {
    const source = read(rel)
    assert.match(source, new RegExp(modeLine.replace(/[|]/g, '\\|')))
    assert.doesNotMatch(source, /['"]card['"]/)
  }
  const anchor = read('./anchor.ts')
  assert.doesNotMatch(anchor, /\bCARD\b/)
  assert.doesNotMatch(anchor, /width:\s*360,\s*height:\s*40/)
  const windowSource = read('./builtin-browser-window.ts')
  assert.doesNotMatch(windowSource, /['"]card['"]/)
  assert.doesNotMatch(windowSource, /\bCARD\b/)
  assert.match(windowSource, /preventDefault/)
  assert.match(windowSource, /modeAfterUserDismiss\(\)/)
  const ensureStart = windowSource.indexOf('export async function ensureBuiltinBrowserWindow')
  const ensureEnd = windowSource.indexOf('export function setBuiltinBrowserMode')
  const ensure = windowSource.slice(ensureStart, ensureEnd)
  const tail = ensure.slice(ensure.lastIndexOf('loadURL'))
  assert.match(tail, /setBuiltinBrowserMode\(modeAfterEnsure\(\)\)/)
  assert.doesNotMatch(tail, /showBuiltinBrowserInactive\(\)/)
  assert.doesNotMatch(tail, /\.showInactive\(\)/)
  assert.doesNotMatch(read('./index.ts'), /['"]card['"]/)
  assert.match(read('./follow-main-window.ts'), /INITIAL_VISIBLE_BEFORE/)
  assert.doesNotMatch(read('./follow-main-window.ts'), /visibleBefore = true/)
})

test('thumbnail overlay and expanded caption expose the EC9 controls', () => {
  const overlay = read('./overlay.html')
  assert.match(overlay, /收起/)
  assert.match(overlay, /放大/)
  assert.match(overlay, /关闭/)
  assert.match(overlay, /HIDE_MS = 400/)
  assert.match(overlay, /-webkit-app-region:\s*drag/)
  assert.match(overlay, /-webkit-app-region:\s*no-drag/)
  assert.doesNotMatch(overlay, /尚未打开页面/)
  const caption = read('./caption.html')
  assert.match(caption, /还原/)
  assert.match(caption, /收起/)
  assert.match(caption, /关闭/)
  assert.doesNotMatch(caption, /放大/)
  assert.doesNotMatch(caption, /dblclick/)
  assert.doesNotMatch(caption, /['"]card['"]/)
  const titleBar = read('../../src/components/layout/TitleBar.vue')
  assert.match(titleBar, /builtinBrowserEntryLabel/)
  assert.doesNotMatch(titleBar, /['"]card['"]/)
  assert.doesNotMatch(titleBar, /panel-top/)
})
