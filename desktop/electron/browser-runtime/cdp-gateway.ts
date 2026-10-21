import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  TOKEN_HTML,
  TOKEN_PATH,
  filterJsonList,
  filterUpstreamMessage,
  interpretClientMessage,
  rewriteVersionBody,
  type ListedTarget,
} from './cdp-filter'
import { acceptWebSocket, connectWebSocket, type WsSocket } from './ws-socket'

let internalPort = 0
let gatewayPort = 0
let pageTargetId: string | null = null
let server: http.Server | null = null
let upstreamBrowserPath = '/devtools/browser'

const sockets = new Set<WsSocket>()
const foreignPageIds = new Set<string>()

export function setInternalDebugPort(port: number): void {
  internalPort = port
}

export function getInternalDebugPort(): number {
  return internalPort
}

export function getBrowserUrl(): string | null {
  if (!server || !gatewayPort) return null
  return `http://127.0.0.1:${gatewayPort}`
}

export function getBuiltinPageTargetId(): string | null {
  return pageTargetId
}

export function setBuiltinPageTargetId(id: string | null): void {
  pageTargetId = id
}

export function tokenPageUrl(): string | null {
  const base = getBrowserUrl()
  if (!base) return null
  return `${base}${TOKEN_PATH}`
}

export async function startCdpGateway(): Promise<string> {
  if (server && gatewayPort) return getBrowserUrl()!
  if (!internalPort) throw new Error('内部调试端口还没有绑定')
  const created = http.createServer((req, res) => {
    void handleHttp(req, res)
  })
  created.on('upgrade', (req, socket, head) => {
    void handleUpgrade(req, socket, head)
  })
  created.on('clientError', (_err, socket) => {
    socket.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    created.once('error', reject)
    created.listen(0, '127.0.0.1', () => resolve())
  })
  const address = created.address()
  gatewayPort = typeof address === 'object' && address ? address.port : 0
  server = created
  return getBrowserUrl()!
}

export async function stopCdpGateway(): Promise<void> {
  pageTargetId = null
  foreignPageIds.clear()
  for (const socket of sockets) socket.close()
  sockets.clear()
  const current = server
  server = null
  gatewayPort = 0
  if (!current) return
  await new Promise<void>((resolve) => {
    current.close(() => resolve())
  })
}

export async function readGatewayVersion(browserUrl: string | null): Promise<{
  status: number | null
  webSocketDebuggerUrl: string | null
  diagnostic: string
}> {
  if (!browserUrl) {
    return { status: null, webSocketDebuggerUrl: null, diagnostic: '网关未监听' }
  }
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 1500)
  try {
    const res = await fetch(`${browserUrl}/json/version`, { signal: ctrl.signal })
    const text = await res.text()
    let ws: string | null = null
    try {
      const json = JSON.parse(text) as { webSocketDebuggerUrl?: unknown }
      ws = typeof json.webSocketDebuggerUrl === 'string' ? json.webSocketDebuggerUrl : null
    } catch {
      ws = null
    }
    return {
      status: res.status,
      webSocketDebuggerUrl: ws,
      diagnostic: `GET ${browserUrl}/json/version ${res.status}`,
    }
  } catch (err) {
    const ms = Date.now() - started
    const reason = err instanceof Error ? err.message : String(err)
    return {
      status: null,
      webSocketDebuggerUrl: null,
      diagnostic: `${browserUrl}/json/version 失败 ${ms}ms ${reason}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function waitForBuiltinTarget(timeoutMs = 3000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const id = await resolveBuiltinTargetOnce()
    if (id) {
      pageTargetId = id
      return id
    }
    await delay(100)
  }
  return pageTargetId
}

export async function sendPageCommand(
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (!pageTargetId || !internalPort) return
  const socket = await pageControl()
  const id = nextCommandId()
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, 2000)
    const unsubscribe = socket.onMessage((text) => {
      try {
        const data = JSON.parse(text) as { id?: number }
        if (data.id === id) finish()
      } catch {
        // 忽略非 JSON
      }
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

let controlSocket: WsSocket | null = null
let controlTarget = ''
let commandSeq = 1

function nextCommandId(): number {
  commandSeq += 1
  return commandSeq
}

async function pageControl(): Promise<WsSocket> {
  if (controlSocket && controlTarget === pageTargetId) return controlSocket
  controlSocket?.close()
  controlTarget = pageTargetId || ''
  const socket = await connectWebSocket(
    `ws://127.0.0.1:${internalPort}/devtools/page/${pageTargetId}`,
    { Origin: `http://127.0.0.1:${internalPort}` },
  )
  sockets.add(socket)
  socket.onClose(() => {
    sockets.delete(socket)
    if (controlSocket === socket) controlSocket = null
  })
  controlSocket = socket
  return socket
}

async function resolveBuiltinTargetOnce(): Promise<string | null> {
  if (!internalPort) return null
  try {
    const res = await fetch(`http://127.0.0.1:${internalPort}/json/list`)
    if (!res.ok) return null
    const list = (await res.json()) as ListedTarget[]
    if (pageTargetId && list.some((item) => item.id === pageTargetId)) return pageTargetId
    const hit = list.find(
      (item) => typeof item.url === 'string' && item.url.includes(TOKEN_PATH) && item.id,
    )
    return hit?.id ?? null
  } catch {
    return null
  }
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url || '/').split('?')[0] || '/'
  try {
    if (req.method === 'GET' && path === TOKEN_PATH) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(TOKEN_HTML)
      return
    }
    if (req.method === 'GET' && (path === '/json/version' || path === '/json/list' || path === '/json')) {
      if (!pageTargetId) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'builtin page not ready' }))
        return
      }
      const upstream = await fetchUpstream(path)
      if (path === '/json/version') {
        const body = JSON.parse(upstream.body) as Record<string, unknown>
        if (typeof body.webSocketDebuggerUrl === 'string') {
          try {
            upstreamBrowserPath = new URL(body.webSocketDebuggerUrl).pathname || upstreamBrowserPath
          } catch {
            // 保留上次的浏览器通道
          }
        }
        const rewritten = rewriteVersionBody(body, gatewayPort)
        res.writeHead(upstream.status, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(rewritten))
        return
      }
      const list = JSON.parse(upstream.body) as ListedTarget[]
      const filtered = filterJsonList(list, pageTargetId, gatewayPort)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(filtered))
      return
    }
    res.writeHead(404)
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(message)
  }
}

async function fetchUpstream(path: string): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 1500)
  try {
    const res = await fetch(`http://127.0.0.1:${internalPort}${path}`, { signal: ctrl.signal })
    const body = await res.text()
    if (!res.ok) throw new Error(`upstream ${path} ${res.status}`)
    return { status: res.status, body }
  } finally {
    clearTimeout(timer)
  }
}

async function handleUpgrade(req: IncomingMessage, socket: import('node:net').Socket, head: Buffer): Promise<void> {
  const path = (req.url || '/').split('?')[0] || '/'
  const client = acceptWebSocket(socket, head, headerOne(req.headers['sec-websocket-key']))
  if (!client) return
  sockets.add(client)
  client.onClose(() => sockets.delete(client))
  const queued: string[] = []
  let onClient = (text: string) => {
    queued.push(text)
  }
  client.onMessage((text) => onClient(text))
  try {
    if (path.startsWith('/devtools/page/')) {
      const id = decodeURIComponent(path.slice('/devtools/page/'.length))
      if (!pageTargetId || id !== pageTargetId) {
        client.close()
        return
      }
      const upstream = await connectWebSocket(`ws://127.0.0.1:${internalPort}${path}`, {
        Origin: `http://127.0.0.1:${internalPort}`,
      })
      sockets.add(upstream)
      pipe(client, upstream, (handler) => {
        onClient = handler
      })
      for (const text of queued) onClient(text)
      return
    }
    if (path.startsWith('/devtools/browser')) {
      const upstream = await connectWebSocket(
        `ws://127.0.0.1:${internalPort}${upstreamBrowserPath}`,
        { Origin: `http://127.0.0.1:${internalPort}` },
      )
      sockets.add(upstream)
      bridgeBrowser(client, upstream, (handler) => {
        onClient = handler
      })
      for (const text of queued) onClient(text)
      return
    }
    client.close()
  } catch {
    client.close()
  }
}

function pipe(
  client: WsSocket,
  upstream: WsSocket,
  bindClient: (handler: (text: string) => void) => void,
): void {
  bindClient((text) => upstream.send(text))
  upstream.onMessage((text) => client.send(text))
  client.onClose(() => upstream.close())
  upstream.onClose(() => client.close())
}

function bridgeBrowser(
  client: WsSocket,
  upstream: WsSocket,
  bindClient: (handler: (text: string) => void) => void,
): void {
  const pending = new Map<number, string>()
  bindClient((text) => {
    let message: unknown
    try {
      message = JSON.parse(text)
    } catch {
      upstream.send(text)
      return
    }
    const decision = interpretClientMessage(message, pageTargetId, tokenPageUrl() || TOKEN_PATH)
    if (decision.kind === 'forward') {
      const msg = message as { id?: unknown; method?: unknown }
      if (typeof msg.id === 'number' && typeof msg.method === 'string') {
        pending.set(msg.id, msg.method)
      }
      upstream.send(text)
      return
    }
    const respond = () => client.send(JSON.stringify(decision.response))
    if (decision.kind === 'navigate') {
      void sendPageCommand('Page.navigate', { url: decision.url }).finally(respond)
      return
    }
    respond()
  })
  upstream.onMessage((text) => {
    let message: unknown
    try {
      message = JSON.parse(text)
    } catch {
      client.send(text)
      return
    }
    const id = (message as { id?: unknown }).id
    const method = typeof id === 'number' ? pending.get(id) : undefined
    if (typeof id === 'number') pending.delete(id)
    const filtered = filterUpstreamMessage(message, pageTargetId, method, foreignPageIds)
    if (filtered == null) return
    client.send(JSON.stringify(filtered))
  })
  client.onClose(() => upstream.close())
  upstream.onClose(() => client.close())
}

function headerOne(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
