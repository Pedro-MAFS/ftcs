import type { AgentPreflightKind, AgentPreflightOptions } from '../ipc/types'

export const PREFLIGHT_BROWSER_READY = '已就绪'
export const PREFLIGHT_BROWSER_NOT_READY =
  '内置浏览器未就绪。请到环境检测里点「重新检测」，或重启应用后再试。'
export const PREFLIGHT_BROWSER_UNAVAILABLE = '内置浏览器暂时不可用。请稍后重试，或重启应用。'

const BROWSER_KINDS = new Set<AgentPreflightKind>([
  'discover-leads',
  'discover-leads-r2',
  'discover-leads-r3',
])

export function needsBuiltinBrowser(
  kind: AgentPreflightKind,
  options?: AgentPreflightOptions,
): boolean {
  if (kind === 'extract-profile') return options?.requireBuiltinBrowser !== false
  return BROWSER_KINDS.has(kind)
}

export interface BuiltinBrowserCheckDeps {
  ensure: () => Promise<{ ok: boolean }>
  getServers: () => Promise<Array<{ name: string; status: string }>>
  reconnect: () => Promise<unknown>
}

export async function resolveBuiltinBrowserCheck(deps: BuiltinBrowserCheckDeps): Promise<{
  id: 'builtin-browser'
  label: '内置浏览器'
  ok: boolean
  detail: string
}> {
  let ready = false
  try {
    ready = (await deps.ensure()).ok
  } catch {
    ready = false
  }
  if (!ready) {
    return {
      id: 'builtin-browser',
      label: '内置浏览器',
      ok: false,
      detail: PREFLIGHT_BROWSER_NOT_READY,
    }
  }

  const connected = async (): Promise<boolean> => {
    try {
      const servers = await deps.getServers()
      const item = servers.find((server) => server.name === 'chrome-devtools')
      return (item?.status || '').toLowerCase() === 'connected'
    } catch {
      return false
    }
  }

  if (await connected()) {
    return {
      id: 'builtin-browser',
      label: '内置浏览器',
      ok: true,
      detail: PREFLIGHT_BROWSER_READY,
    }
  }

  try {
    await deps.reconnect()
  } catch {
    // 这一轮只重连一次，失败后看状态
  }

  if (await connected()) {
    return {
      id: 'builtin-browser',
      label: '内置浏览器',
      ok: true,
      detail: PREFLIGHT_BROWSER_READY,
    }
  }
  return {
    id: 'builtin-browser',
    label: '内置浏览器',
    ok: false,
    detail: PREFLIGHT_BROWSER_UNAVAILABLE,
  }
}
