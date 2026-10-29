import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterJsonList,
  filterUpstreamMessage,
  interpretClientMessage,
  relaxDebuggerPause,
  sessionNeedsDebuggerResume,
} from './cdp-filter.ts'

const pageId = 'page-1'
const token = 'http://127.0.0.1:43123/__ftcs_builtin_page__'

test('T6 json list keeps only the token page', () => {
  const filtered = filterJsonList(
    [
      { id: 'main', type: 'page', url: 'http://127.0.0.1:5173/', title: 'FTCS' },
      { id: 'caption', type: 'page', url: 'data:text/html,caption', title: '内置浏览器' },
      {
        id: pageId,
        type: 'page',
        url: token,
        title: '',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/page-1',
      },
    ],
    pageId,
    43123,
  )
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.id, pageId)
  assert.equal(filtered[0]?.webSocketDebuggerUrl, 'ws://127.0.0.1:43123/devtools/page/page-1')
})

test('json list keeps every browsing page and drops the main window', () => {
  const filtered = filterJsonList(
    [
      { id: 'main', type: 'page', url: 'http://127.0.0.1:5173/', title: 'FTCS' },
      { id: pageId, type: 'page', url: token, title: '' },
      { id: 'page-2', type: 'page', url: 'https://northline.example', title: 'Northline' },
      { id: 'caption', type: 'page', url: 'data:text/html,caption', title: '' },
    ],
    new Set([pageId, 'page-2']),
    43123,
  )
  assert.deepEqual(
    filtered.map((item) => item.id),
    [pageId, 'page-2'],
  )
})

test('T7 createTarget asks for a new tab and does not describe a new window', () => {
  const decision = interpretClientMessage(
    { id: 7, method: 'Target.createTarget', params: { url: 'https://northline.example' } },
    pageId,
  )
  assert.equal(decision.kind, 'create-tab')
  if (decision.kind !== 'create-tab') return
  assert.equal(decision.url, 'https://northline.example')
  assert.equal(decision.responseId, 7)
  assert.equal(JSON.stringify(decision).includes('BrowserWindow'), false)
})

test('createTarget before the first page is an error', () => {
  const decision = interpretClientMessage(
    { id: 7, method: 'Target.createTarget', params: { url: 'https://northline.example' } },
    null,
  )
  assert.equal(decision.kind, 'respond')
  if (decision.kind !== 'respond') return
  assert.equal((decision.response.error as { message: string }).message, 'builtin page not ready')
})

test('closeTarget and activateTarget name the browsing page', () => {
  const close = interpretClientMessage(
    { id: 8, method: 'Target.closeTarget', params: { targetId: pageId } },
    pageId,
  )
  assert.equal(close.kind, 'close-tab')
  if (close.kind !== 'close-tab') return
  assert.equal(close.targetId, pageId)
  assert.equal(close.responseId, 8)

  const activate = interpretClientMessage(
    { id: 9, method: 'Target.activateTarget', params: { targetId: 'page-2' } },
    pageId,
  )
  assert.equal(activate.kind, 'activate-tab')
  if (activate.kind !== 'activate-tab') return
  assert.equal(activate.targetId, 'page-2')
})

test('upstream target events drop foreign pages and keep the builtin page', () => {
  const foreign = new Set<string>()
  const dropped = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: 'main', type: 'page', url: 'app://ftcs' } },
    },
    pageId,
    undefined,
    foreign,
  )
  const kept = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: pageId, type: 'page', url: token } },
    },
    pageId,
    undefined,
    foreign,
  )
  assert.equal(dropped, null)
  assert.ok(kept)
  assert.equal(foreign.has('main'), true)

  const destroyed = filterUpstreamMessage(
    { method: 'Target.targetDestroyed', params: { targetId: 'main' } },
    pageId,
    undefined,
    foreign,
  )
  assert.equal(destroyed, null)

  const listed = filterUpstreamMessage(
    {
      id: 3,
      result: {
        targetInfos: [
          { targetId: 'main', type: 'page', url: 'app://ftcs' },
          { targetId: 'worker', type: 'service_worker', url: '' },
          { targetId: pageId, type: 'page', url: 'https://northline.example' },
        ],
      },
    },
    pageId,
    'Target.getTargets',
    foreign,
  ) as { result: { targetInfos: Array<{ targetId: string }> } }
  assert.deepEqual(
    listed.result.targetInfos.map((item) => item.targetId),
    ['worker', pageId],
  )
})

test('while a tab is expected, about:blank is kept and the main window is not', () => {
  const ids = new Set([pageId])
  const foreign = new Set<string>()
  const admission = { expecting: 1, announced: new Set<string>(), pendingUrl: 'about:blank' }
  const kept = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: 'page-2', type: 'page', url: 'about:blank' } },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  const dropped = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: 'main', type: 'page', url: 'http://127.0.0.1:5173/' } },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.ok(kept)
  assert.equal(dropped, null)
  assert.equal(ids.has('page-2'), true)
  assert.equal(foreign.has('main'), true)

  const duplicate = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: 'page-2', type: 'page', url: 'about:blank' } },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.equal(duplicate, null)
})

test('an empty url update is not forwarded', () => {
  const filtered = filterUpstreamMessage(
    {
      method: 'Target.targetInfoChanged',
      params: { targetInfo: { targetId: pageId, type: 'page', url: '' } },
    },
    pageId,
    undefined,
    new Set(),
  )
  assert.equal(filtered, null)
})

test('a shell page auto-attach is not given to the browser tool', () => {
  const ids = new Set([pageId])
  const foreign = new Set<string>()
  const admission = { expecting: 1, announced: new Set<string>(), pendingUrl: 'https://www.fmicc.com' }
  const dropped = filterUpstreamMessage(
    {
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'sess-main',
        targetInfo: {
          targetId: 'main',
          type: 'page',
          url: 'http://localhost:5173/#/profile',
        },
      },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.equal(dropped, null)
  assert.equal(ids.has('main'), false)
  assert.equal(foreign.has('main'), true)

  const kept = filterUpstreamMessage(
    {
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'sess-site',
        targetInfo: {
          targetId: 'page-2',
          type: 'page',
          url: 'https://www.fmicc.com/',
        },
      },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.ok(kept)
  assert.equal(ids.has('page-2'), false)
})

test('auto-attach no longer pauses the next document', () => {
  const relaxed = relaxDebuggerPause({
    id: 4,
    method: 'Target.setAutoAttach',
    sessionId: 'sess-site',
    params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{}] },
  }) as { params: { waitForDebuggerOnStart: boolean; autoAttach: boolean }; sessionId: string }
  assert.equal(relaxed.params.waitForDebuggerOnStart, false)
  assert.equal(relaxed.params.autoAttach, true)
  assert.equal(relaxed.sessionId, 'sess-site')
  assert.equal(sessionNeedsDebuggerResume('Runtime.evaluate'), true)
  assert.equal(sessionNeedsDebuggerResume('Accessibility.getFullAXTree'), false)
})

test('an empty url is not adopted as a new tab', () => {
  const ids = new Set([pageId])
  const foreign = new Set<string>()
  const admission = { expecting: 1, announced: new Set<string>(), pendingUrl: 'https://fmicc.com' }
  const dropped = filterUpstreamMessage(
    {
      method: 'Target.targetCreated',
      params: { targetInfo: { targetId: 'main', type: 'page', url: '' } },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.equal(dropped, null)
  assert.equal(ids.has('main'), false)
  assert.equal(foreign.has('main'), true)
})

test('the app window stays hidden even if its id was recorded', () => {
  const ids = new Set([pageId, 'main'])
  const filtered = filterJsonList(
    [
      {
        id: 'main',
        type: 'page',
        url: 'file:///F:/ft/install/@ftcsdesktop/resources/app.asar/out/renderer/index.html#/profile',
        title: '外贸获客智能体',
      },
      { id: pageId, type: 'page', url: 'https://fmicc.com/', title: 'FMICC' },
    ],
    ids,
    43123,
  )
  assert.deepEqual(
    filtered.map((item) => item.id),
    [pageId],
  )
  assert.equal(ids.has('main'), false)
})

test('a recorded page that later shows the app url is forgotten', () => {
  const ids = new Set([pageId, 'main'])
  const foreign = new Set<string>()
  const admission = { expecting: 0, announced: new Set(['main']), pendingUrl: 'https://fmicc.com' }
  const dropped = filterUpstreamMessage(
    {
      method: 'Target.targetInfoChanged',
      params: {
        targetInfo: {
          targetId: 'main',
          type: 'page',
          url: 'file:///app/index.html',
        },
      },
    },
    ids,
    undefined,
    foreign,
    admission,
  )
  assert.equal(dropped, null)
  assert.equal(ids.has('main'), false)
  assert.equal(admission.announced.has('main'), false)
  assert.equal(foreign.has('main'), true)
})
