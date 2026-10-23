import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterJsonList,
  filterUpstreamMessage,
  interpretClientMessage,
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

test('T7 createTarget returns the existing page and does not describe a new window', () => {
  const decision = interpretClientMessage(
    { id: 7, method: 'Target.createTarget', params: { url: 'https://northline.example' } },
    pageId,
    token,
  )
  assert.equal(decision.kind, 'navigate')
  if (decision.kind !== 'navigate') return
  assert.equal(decision.url, 'https://northline.example')
  assert.deepEqual(decision.response, { id: 7, result: { targetId: pageId } })
  assert.equal(JSON.stringify(decision).includes('BrowserWindow'), false)
})

test('closeTarget stays on the token page and reports success', () => {
  const decision = interpretClientMessage(
    { id: 8, method: 'Target.closeTarget', params: { targetId: pageId } },
    pageId,
    token,
  )
  assert.equal(decision.kind, 'navigate')
  if (decision.kind !== 'navigate') return
  assert.equal(decision.url, token)
  assert.deepEqual(decision.response, { id: 8, result: { success: true } })
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
