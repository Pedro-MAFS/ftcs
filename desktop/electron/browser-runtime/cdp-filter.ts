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

/**
 * 正在等新标签时，about 页、令牌页和这次要打开的地址可以收下。
 * 空地址不能收：主窗刷新时也会先报空地址。
 */
export function isAdoptableTabUrl(url: string | undefined, requestedUrl: string): boolean {
  if (!url || isShellPageUrl(url)) return false
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
  if (isShellPageUrl(target.url)) return false
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
    .filter((item) => {
      if (item.type != null && item.type !== 'page') return false
      if (isShellPageUrl(item.url)) {
        forgetShellPage(item.id, pageId)
        return false
      }
      return isBuiltinPage(item, pageId)
    })
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
  return infos.filter((info) => {
    if (info.type !== 'page') return true
    if (isShellPageUrl(info.url)) {
      forgetShellPage(info.targetId, pageId)
      return false
    }
    return isBuiltinPage(info, pageId)
  })
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

/** 浏览工具会让新文档先停住。停住之后页面还能画，但脚本命令会一直等。 */
export function relaxDebuggerPause(message: unknown): unknown {
  if (!message || typeof message !== 'object') return message
  const msg = message as { method?: string; params?: Record<string, unknown> | null }
  if (msg.method !== 'Target.setAutoAttach' && msg.method !== 'Target.autoAttachRelated') return message
  if (!msg.params || msg.params.waitForDebuggerOnStart !== true) return message
  return {
    ...msg,
    params: { ...msg.params, waitForDebuggerOnStart: false },
  }
}

export function sessionNeedsDebuggerResume(method: string): boolean {
  return (
    method === 'Runtime.evaluate' ||
    method === 'Runtime.callFunctionOn' ||
    method === 'Runtime.awaitPromise' ||
    method === 'Page.navigate' ||
    method === 'Page.reload' ||
    method === 'Page.navigateToHistoryEntry'
  )
}

export function navigationNeedsDebuggerResume(method: string): boolean {
  return (
    method === 'Page.frameNavigated' ||
    method === 'Page.frameStoppedLoading' ||
    method === 'Page.domContentEventFired' ||
    method === 'Page.loadEventFired'
  )
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

  const held = shellAttachToRelease(message)
  if (held) {
    forgetShellPage(held.targetId, pageId, foreignPageIds, admission)
    return null
  }

  if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
    const info = msg.params?.targetInfo
    if (info && info.type === 'page') {
      const id = typeof info.targetId === 'string' ? info.targetId : ''
      if (isShellPageUrl(info.url)) {
        forgetShellPage(id, pageId, foreignPageIds, admission)
        return null
      }
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

/** 调试器自动挂上主窗或标题条时，不要把这条会话交给浏览工具。 */
export function shellAttachToRelease(message: unknown): { sessionId: string; targetId: string } | null {
  if (!message || typeof message !== 'object') return null
  const msg = message as {
    method?: string
    params?: { sessionId?: unknown; targetInfo?: TargetInfo }
  }
  if (msg.method !== 'Target.attachedToTarget') return null
  const info = msg.params?.targetInfo
  const sessionId = typeof msg.params?.sessionId === 'string' ? msg.params.sessionId : ''
  if (!info || !sessionId || !isShellPageUrl(info.url)) return null
  return {
    sessionId,
    targetId: typeof info.targetId === 'string' ? info.targetId : '',
  }
}

/** 主窗、标题条一旦被记进浏览页，立刻忘掉，避免后面的空地址又把它认回来。 */
function forgetShellPage(
  id: string | undefined,
  pageId: PageSelector,
  foreignPageIds?: Set<string>,
  admission?: TargetAdmission,
): void {
  if (!id) return
  if (pageId instanceof Set) pageId.delete(id)
  foreignPageIds?.add(id)
  admission?.announced.delete(id)
}
