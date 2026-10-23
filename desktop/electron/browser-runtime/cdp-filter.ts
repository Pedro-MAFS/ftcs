export const TOKEN_PATH = '/__ftcs_builtin_page__'

export const TOKEN_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

export interface ListedTarget {
  id?: string
  type?: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
  [key: string]: unknown
}

export interface TargetInfo {
  targetId?: string
  type?: string
  url?: string
  title?: string
  [key: string]: unknown
}

export function isBuiltinPage(
  target: { id?: string; targetId?: string; url?: string },
  pageId: string | null,
): boolean {
  const id = target.id || target.targetId
  if (pageId && id === pageId) return true
  return typeof target.url === 'string' && target.url.includes(TOKEN_PATH)
}

export function rewriteLoopbackWebSocket(upstreamUrl: string, gatewayPort: number): string {
  const parsed = new URL(upstreamUrl)
  return `ws://127.0.0.1:${gatewayPort}${parsed.pathname}${parsed.search}`
}

export function rewriteVersionBody(
  body: Record<string, unknown>,
  gatewayPort: number,
): Record<string, unknown> {
  const next = { ...body }
  const ws = body.webSocketDebuggerUrl
  if (typeof ws === 'string' && ws.trim()) {
    next.webSocketDebuggerUrl = rewriteLoopbackWebSocket(ws, gatewayPort)
  }
  return next
}

/** `/json/list` 与 `/json` 只留浏览页。主窗、标题条和其它目标都不出去。 */
export function filterJsonList(
  list: ListedTarget[],
  pageId: string | null,
  gatewayPort: number,
): ListedTarget[] {
  const page = list.find(
    (item) => (item.type == null || item.type === 'page') && isBuiltinPage(item, pageId),
  )
  if (!page) return []
  const id = typeof page.id === 'string' ? page.id : ''
  return [
    {
      ...page,
      webSocketDebuggerUrl: id
        ? `ws://127.0.0.1:${gatewayPort}/devtools/page/${id}`
        : page.webSocketDebuggerUrl,
    },
  ]
}

export function filterTargetInfos(infos: TargetInfo[], pageId: string | null): TargetInfo[] {
  return infos.filter((info) => info.type !== 'page' || isBuiltinPage(info, pageId))
}

export type ClientDecision =
  | { kind: 'forward' }
  | { kind: 'respond'; response: Record<string, unknown> }
  | { kind: 'navigate'; url: string; response: Record<string, unknown> }

export function interpretClientMessage(
  message: unknown,
  pageId: string | null,
  tokenUrl: string,
): ClientDecision {
  if (!message || typeof message !== 'object') return { kind: 'forward' }
  const msg = message as {
    id?: unknown
    method?: unknown
    params?: { url?: unknown }
  }
  if (msg.method === 'Target.createTarget') {
    const raw = msg.params?.url
    const url = typeof raw === 'string' && raw.trim() ? raw : tokenUrl
    if (!pageId) {
      return {
        kind: 'respond',
        response: {
          id: msg.id,
          error: { code: -32000, message: 'builtin page not ready' },
        },
      }
    }
    return {
      kind: 'navigate',
      url,
      response: { id: msg.id, result: { targetId: pageId } },
    }
  }
  if (msg.method === 'Target.closeTarget') {
    return {
      kind: 'navigate',
      url: tokenUrl,
      response: { id: msg.id, result: { success: true } },
    }
  }
  return { kind: 'forward' }
}

export function filterUpstreamMessage(
  message: unknown,
  pageId: string | null,
  pendingMethod: string | undefined,
  foreignPageIds: Set<string>,
): unknown | null {
  if (!message || typeof message !== 'object') return message
  const msg = message as {
    method?: string
    params?: { targetInfo?: TargetInfo; targetId?: string }
    result?: { targetInfos?: TargetInfo[] }
  }

  if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
    const info = msg.params?.targetInfo
    if (info && info.type === 'page' && !isBuiltinPage(info, pageId)) {
      if (info.targetId) foreignPageIds.add(info.targetId)
      return null
    }
    return message
  }

  if (msg.method === 'Target.targetDestroyed') {
    const id = msg.params?.targetId
    if (typeof id === 'string' && foreignPageIds.has(id) && id !== pageId) return null
    return message
  }

  if (pendingMethod === 'Target.getTargets' && msg.result && Array.isArray(msg.result.targetInfos)) {
    return {
      ...msg,
      result: {
        ...msg.result,
        targetInfos: filterTargetInfos(msg.result.targetInfos, pageId),
      },
    }
  }

  return message
}
