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

export type PageSelector = string | ReadonlySet<string> | null

/** 主窗、标题条、蒙层不要收成浏览标签。 */
export function isShellPageUrl(url: string | undefined): boolean {
  if (!url) return false
  const value = url.toLowerCase()
  if (value.startsWith('data:')) return true
  if (value.startsWith('devtools:')) return true
  if (value.startsWith('chrome-extension:')) return true
  if (value.startsWith('chrome:')) return true
  if (value.startsWith('file:')) return true
  if (value.startsWith('app:')) return true
  return /^https?:\/\/(127\.0\.0\.1|localhost):5173(\/|$)/i.test(url)
}

/** 正在等新标签时，空白页、令牌页和这次要打开的地址可以收下。 */
export function isAdoptableTabUrl(url: string | undefined, requestedUrl: string): boolean {
  if (isShellPageUrl(url)) return false
  if (!url) return true
  if (url.startsWith('about:')) return true
  if (url.includes(TOKEN_PATH)) return true
  if (requestedUrl && (url === requestedUrl || url.startsWith(requestedUrl))) return true
  return false
}

export interface TargetAdmission {
  expecting: number
  announced: Set<string>
  pendingUrl: string
}

export function isBuiltinPage(
  target: { id?: string; targetId?: string; url?: string },
  pageId: PageSelector,
): boolean {
  const id = target.id || target.targetId
  if (typeof pageId === 'string') {
    if (pageId && id === pageId) return true
  } else if (pageId && id && pageId.has(id)) {
    return true
  }
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

/** `/json/list` 与 `/json` 只留浏览标签。主窗、标题条和其它目标都不出去。 */
export function filterJsonList(
  list: ListedTarget[],
  pageId: PageSelector,
  gatewayPort: number,
): ListedTarget[] {
  return list
    .filter((item) => (item.type == null || item.type === 'page') && isBuiltinPage(item, pageId))
    .map((page) => {
      const id = typeof page.id === 'string' ? page.id : ''
      return {
        ...page,
        webSocketDebuggerUrl: id
          ? `ws://127.0.0.1:${gatewayPort}/devtools/page/${id}`
          : page.webSocketDebuggerUrl,
      }
    })
}

export function filterTargetInfos(infos: TargetInfo[], pageId: PageSelector): TargetInfo[] {
  return infos.filter((info) => info.type !== 'page' || isBuiltinPage(info, pageId))
}

export type ClientDecision =
  | { kind: 'forward' }
  | { kind: 'respond'; response: Record<string, unknown> }
  | { kind: 'create-tab'; url: string; responseId: unknown }
  | { kind: 'close-tab'; targetId: string; responseId: unknown }
  | { kind: 'activate-tab'; targetId: string; responseId: unknown }

export function interpretClientMessage(message: unknown, pageId: string | null): ClientDecision {
  if (!message || typeof message !== 'object') return { kind: 'forward' }
  const msg = message as {
    id?: unknown
    method?: unknown
    params?: { url?: unknown; targetId?: unknown }
  }
  if (msg.method === 'Target.createTarget') {
    if (!pageId) {
      return {
        kind: 'respond',
        response: {
          id: msg.id,
          error: { code: -32000, message: 'builtin page not ready' },
        },
      }
    }
    const raw = msg.params?.url
    const url = typeof raw === 'string' && raw.trim() ? raw : 'about:blank'
    return { kind: 'create-tab', url, responseId: msg.id }
  }
  if (msg.method === 'Target.closeTarget' || msg.method === 'Target.activateTarget') {
    const raw = msg.params?.targetId
    const targetId = typeof raw === 'string' ? raw : ''
    return msg.method === 'Target.closeTarget'
      ? { kind: 'close-tab', targetId, responseId: msg.id }
      : { kind: 'activate-tab', targetId, responseId: msg.id }
  }
  return { kind: 'forward' }
}

export function filterUpstreamMessage(
  message: unknown,
  pageId: PageSelector,
  pendingMethod: string | undefined,
  foreignPageIds: Set<string>,
  admission?: TargetAdmission,
): unknown | null {
  if (!message || typeof message !== 'object') return message
  const msg = message as {
    method?: string
    params?: { targetInfo?: TargetInfo; targetId?: string }
    result?: { targetInfos?: TargetInfo[] }
  }

  if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
    const info = msg.params?.targetInfo
    if (info && info.type === 'page') {
      const id = typeof info.targetId === 'string' ? info.targetId : ''
      if (!isBuiltinPage(info, pageId)) {
        const adopt =
          Boolean(admission && admission.expecting > 0 && id && pageId instanceof Set) &&
          isAdoptableTabUrl(info.url, admission?.pendingUrl || '')
        if (adopt && pageId instanceof Set) {
          pageId.add(id)
          foreignPageIds.delete(id)
        } else {
          if (id) foreignPageIds.add(id)
          return null
        }
      }
      if (msg.method === 'Target.targetInfoChanged' && info.url === '') return null
      if (msg.method === 'Target.targetCreated' && id && admission) {
        if (admission.announced.has(id)) return null
        admission.announced.add(id)
      }
    }
    return message
  }

  if (msg.method === 'Target.targetDestroyed') {
    const id = msg.params?.targetId
    if (typeof id === 'string' && foreignPageIds.has(id) && !isKnownPage(id, pageId)) return null
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

function isKnownPage(id: string, pageId: PageSelector): boolean {
  if (typeof pageId === 'string') return id === pageId
  return Boolean(pageId && pageId.has(id))
}
