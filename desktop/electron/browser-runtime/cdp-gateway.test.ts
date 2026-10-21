import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { filterJsonList } from './cdp-filter.ts'
import {
  getBrowserUrl,
  setBuiltinPageTargetId,
  setInternalDebugPort,
  startCdpGateway,
  stopCdpGateway,
} from './cdp-gateway.ts'
import { acceptWebSocket, connectWebSocket } from './ws-socket.ts'

test('gateway lists only the builtin page and turns createTarget into navigate', async () => {
  const browserMessages: string[] = []
  const pageMessages: string[] = []
  let port = 0
  const upstream = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]
    if (path === '/json/version') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          Browser: 'Chrome/134',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/bid`,
        }),
      )
      return
    }
    if (path === '/json/list' || path === '/json') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify([
          { id: 'main', type: 'page', url: 'http://127.0.0.1:5173/', title: 'FTCS' },
          {
            id: 'page-1',
            type: 'page',
            url: 'http://127.0.0.1:9/__ftcs_builtin_page__',
            title: '',
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-1`,
          },
        ]),
      )
      return
    }
    res.statusCode = 404
    res.end()
  })
  upstream.on('upgrade', (req, socket, head) => {
    const path = req.url || '/'
    const ws = acceptWebSocket(socket, head, req.headers['sec-websocket-key'])
    if (!ws) return
    ws.onMessage((text) => {
      if (path.startsWith('/devtools/page/')) {
        pageMessages.push(text)
        const message = JSON.parse(text) as { id?: number }
        ws.send(JSON.stringify({ id: message.id, result: {} }))
        return
      }
      browserMessages.push(text)
    })
  })
  upstream.on('clientError', (_err, socket) => socket.destroy())
  await new Promise<void>((resolve) => {
    upstream.listen(0, '127.0.0.1', () => {
      const address = upstream.address()
      port = typeof address === 'object' && address ? address.port : 0
      resolve()
    })
  })

  try {
    setInternalDebugPort(port)
    setBuiltinPageTargetId('page-1')
    const browserUrl = await startCdpGateway()
    assert.equal(getBrowserUrl(), browserUrl)
    assert.match(browserUrl, /^http:\/\/127\.0\.0\.1:\d+$/)

    const token = await fetch(`${browserUrl}/__ftcs_builtin_page__`)
    assert.equal(token.status, 200)
    assert.match(await token.text(), /<html>/)

    const version = await fetch(`${browserUrl}/json/version`)
    assert.equal(version.status, 200)
    const versionBody = (await version.json()) as { webSocketDebuggerUrl: string }
    const rewritten = new URL(versionBody.webSocketDebuggerUrl)
    assert.equal(rewritten.pathname, '/devtools/browser/bid')
    assert.notEqual(Number(rewritten.port), port)

    const listResponse = await fetch(`${browserUrl}/json/list`)
    const list = (await listResponse.json()) as Array<{ id: string; url: string; webSocketDebuggerUrl: string }>
    const gatewayPort = Number(new URL(browserUrl).port)
    assert.deepEqual(filterJsonList(list, 'page-1', gatewayPort).map((item) => item.id), ['page-1'])
    assert.equal(list.length, 1)
    assert.equal(list[0]?.id, 'page-1')
    assert.match(list[0]!.webSocketDebuggerUrl, /\/devtools\/page\/page-1$/)

    const client = await connectWebSocket(versionBody.webSocketDebuggerUrl)
    const response = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('createTarget response timeout')), 4000)
      client.onMessage((text) => {
        clearTimeout(timer)
        resolve(text)
      })
    })
    client.send(
      JSON.stringify({
        id: 4,
        method: 'Target.createTarget',
        params: { url: 'https://northline.example' },
      }),
    )
    const raw = await response
    assert.deepEqual(JSON.parse(raw), { id: 4, result: { targetId: 'page-1' } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(
      browserMessages.some((line) => line.includes('Target.createTarget')),
      false,
    )
    assert.equal(pageMessages.some((line) => line.includes('Page.navigate')), true)
    assert.equal(pageMessages.some((line) => line.includes('https://northline.example')), true)
    client.close()
  } finally {
    await stopCdpGateway()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }
})
