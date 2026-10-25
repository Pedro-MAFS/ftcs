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
  type TargetAdmission,
} from './cdp-filter'
import { acceptWebSocket, connectWebSocket, type WsSocket } from './ws-socket'

let internalPort = 0
let gatewayPort = 0
let pageTargetId: string | null = null
let server: http.Server | null = null
let upstreamBrowserPath = '/devtools/browser'

const sockets = new Set<WsSocket>()
const foreignPageIds = new Set<string>()
const browserPageIds = new Set<string>()
const browserClients = new Set<WsSocket>()
const controlSockets = new Map<string, WsSocket>()
const admission: TargetAdmission = {
  expecting: 0,
  announced: new Set<string>(),
  pendingUrl: 'about:blank',
}

export interface BuiltinTabHost {
  openTab(url: string): Promise<{ id: string; url: string }>
  closeTab(targetId: string): Promise<boolean>
  activateTab(targetId: string): Promise<boolean>
}

let tabHost: BuiltinTabHost | null = null

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
  if (id) {
    browserPageIds.add(id)
    return
  }
  browserPageIds.clear()
  admission.announced.clear()
  admission.expecting = 0
  admission.pendingUrl = 'about:blank'
}

export function registerBrowserPage(id: string): void {
  if (!id) return
  browserPageIds.add(id)
  if (!pageTargetId) pageTargetId = id
}

export function unregisterBrowserPage(id: string): void {
  browserPageIds.delete(id)
  admission.announced.delete(id)
  const socket = controlSockets.get(id)
  if (socket) {
    controlSockets.delete(id)
    socket.close()
  }
  if (pageTargetId === id) pageTargetId = firstBrowserPageId()
}

export function listBrowserPageIds(): string[] {
  return [...browserPageIds]
}

export function setBuiltinBrowserTabHost(host: BuiltinTabHost | null): void {
  tabHost = host
}

export function beginTabAdoption(url: string): void {
  admission.expecting += 1
  admission.pendingUrl = url || 'about:blank'
}

export function endTabAdoption(): void {
  admission.expecting = Math.max(0, admission.expecting - 1)
}

function firstBrowserPageId(): string | null {
  const next = browserPageIds.values().next()
  return next.done ? null : next.value
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
  browserPageIds.clear()
  admission.announced.clear()
  admission.expecting = 0
  foreignPageIds.clear()
  browserClients.clear()
  controlSockets.clear()
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
      setBuiltinPageTargetId(id)
      return id
    }
    await delay(100)
  }
  return pageTargetId
}

export async function sendPageCommand(
  method: string,
  params: Record<string, unknown>,
  targetId?: string | null,
): Promise<void> {
  const id = targetId || pageTargetId
  if (!id || !internalPort) return
  const socket = await pageControl(id)
  const commandId = nextCommandId()
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
        if (data.id === commandId) finish()
      } catch {
        // 忽略非 JSON
      }
    })
    socket.send(JSON.stringify({ id: commandId, method, params }))
  })
}

let commandSeq = 1

function nextCommandId(): number {
  commandSeq += 1
  return commandSeq
}

async function pageControl(targetId: string): Promise<WsSocket> {
  const existing = controlSockets.get(targetId)
  if (existing) return existing
  const socket = await connectWebSocket(
    `ws://127.0.0.1:${internalPort}/devtools/page/${targetId}`,
    { Origin: `http://127.0.0.1:${internalPort}` },
  )
  sockets.add(socket)
  controlSockets.set(targetId, socket)
  socket.onClose(() => {
    sockets.delete(socket)
    if (controlSockets.get(targetId) === socket) controlSockets.delete(targetId)
  })
  return socket
}

export async function listInternalTargets(): Promise<ListedTarget[]> {
  if (!internalPort) return []
  try {
    const res = await fetch(`http://127.0.0.1:${internalPort}/json/list`)
    if (!res.ok) return []
    return (await res.json()) as ListedTarget[]
  } catch {
    return []
  }
}

export function announceBrowserPage(targetId: string, url: string): void {
  if (!targetId) return
  const info = {
    targetId,
    type: 'page',
    title: '',
    url: url.trim() || 'about:blank',
    attached: false,
    canAccessOpener: false,
  }
  if (!admission.announced.has(targetId)) {
    admission.announced.add(targetId)
    broadcastBrowser({ method: 'Target.targetCreated', params: { targetInfo: info } })
  }
  broadcastBrowser({ method: 'Target.targetInfoChanged', params: { targetInfo: info } })
}

function broadcastBrowser(payload: unknown): void {
  const text = JSON.stringify(payload)
  for (const client of browserClients) {
    try {
      client.send(text)
    } catch {
      // 这条浏览器通道已经断了
    }
  }
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
      const filtered = filterJsonList(list, browserPageIds, gatewayPort)
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
      if (!browserPageIds.has(id)) {
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
  browserClients.add(client)
  let chain = Promise.resolve()
  bindClient((text) => {
    chain = chain
      .then(() => handleBrowserClientMessage(client, upstream, pending, text))
      .then(
        () => undefined,
        () => undefined,
      )
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
    const filtered = filterUpstreamMessage(message, browserPageIds, method, foreignPageIds, admission)
    if (filtered == null) return
    client.send(JSON.stringify(filtered))
  })
  client.onClose(() => {
    browserClients.delete(client)
    upstream.close()
  })
  upstream.onClose(() => client.close())
}

async function handleBrowserClientMessage(
  client: WsSocket,
  upstream: WsSocket,
  pending: Map<number, string>,
  text: string,
): Promise<void> {
  let message: unknown
  try {
    message = JSON.parse(text)
  } catch {
    upstream.send(text)
    return
  }
  const decision = interpretClientMessage(message, pageTargetId)
  if (decision.kind === 'forward') {
    const msg = message as { id?: unknown; method?: unknown }
    if (typeof msg.id === 'number' && typeof msg.method === 'string') pending.set(msg.id, msg.method)
    upstream.send(text)
    return
  }
  if (decision.kind === 'respond') {
    client.send(JSON.stringify(decision.response))
    return
  }
  if (decision.kind === 'create-tab') {
    try {
      if (!tabHost || !pageTargetId) throw new Error('builtin page not ready')
      const opened = await tabHost.openTab(decision.url)
      registerBrowserPage(opened.id)
      announceBrowserPage(opened.id, opened.url)
      client.send(JSON.stringify({ id: decision.responseId, result: { targetId: opened.id } }))
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err)
      client.send(
        JSON.stringify({
          id: decision.responseId,
          error: { code: -32000, message: messageText },
        }),
      )
    }
    return
  }
  if (decision.kind === 'close-tab') {
    let success = false
    try {
      success = tabHost ? await tabHost.closeTab(decision.targetId) : false
    } catch {
      success = false
    }
    client.send(JSON.stringify({ id: decision.responseId, result: { success } }))
    return
  }
  if (decision.kind === 'activate-tab') {
    try {
      if (tabHost) await tabHost.activateTab(decision.targetId)
    } catch {
      // 切标签失败也要先把这条命令回掉
    }
    client.send(JSON.stringify({ id: decision.responseId, result: {} }))
  }
}

function headerOne(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
