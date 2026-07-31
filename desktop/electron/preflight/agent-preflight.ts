import { getSettingsSnapshot } from '../settings/settings-service'
import type { OpenCodeRuntime } from '../opencode/runtime'

export type AgentPreflightKind =
  | 'extract-profile'
  | 'expand-keywords'
  | 'discover-leads'
  | 'score-and-dedupe'
  | 'draft-email'

export interface AgentPreflightCheck {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface AgentPreflightResult {
  ok: boolean
  message: string
  checks: AgentPreflightCheck[]
}

export interface AgentPreflightContext {
  runtime: OpenCodeRuntime | null
  isAgentRunning: () => boolean
}

function needsSearch(kind: AgentPreflightKind): boolean {
  return kind === 'discover-leads'
}

function needsChrome(kind: AgentPreflightKind): boolean {
  return kind === 'extract-profile' || kind === 'discover-leads'
}

function mcpOk(
  servers: Array<{ name: string; status: string; error?: string }>,
  name: string,
): { ok: boolean; detail?: string } {
  const item = servers.find((s) => s.name === name)
  if (!item) {
    return { ok: false, detail: `未在 OpenCode 中发现 MCP「${name}」` }
  }
  const status = (item.status || '').toLowerCase()
  if (status === 'connected') return { ok: true, detail: status }
  return {
    ok: false,
    detail: item.error
      ? `${item.status}：${item.error}`
      : `状态为 ${item.status || 'unknown'}（需要 connected）`,
  }
}

/**
 * Agent 任务启动前门禁：OpenCode / 模型 Key / 搜索 Key / 关键 MCP。
 */
export async function runAgentPreflight(
  kind: AgentPreflightKind,
  ctx: AgentPreflightContext,
): Promise<AgentPreflightResult> {
  const checks: AgentPreflightCheck[] = []

  if (ctx.isAgentRunning()) {
    checks.push({
      id: 'agent-idle',
      label: '无其它 Agent 任务',
      ok: false,
      detail: '请等待当前任务结束',
    })
  } else {
    checks.push({
      id: 'agent-idle',
      label: '无其它 Agent 任务',
      ok: true,
    })
  }

  const runtime = ctx.runtime
  const runtimeState = runtime?.getStatus().state
  const hasClient = Boolean(runtime?.getClient())
  let healthy = false
  if (runtime && runtimeState === 'running' && hasClient) {
    healthy = await runtime.healthCheck()
  }

  if (!runtime || runtimeState !== 'running' || !hasClient || !healthy) {
    checks.push({
      id: 'opencode',
      label: 'OpenCode 运行时',
      ok: false,
      detail:
        runtimeState === 'starting'
          ? '正在启动，请稍候再试'
          : '未就绪。请到设置页确认本机已安装 OpenCode，或点击「重启 OpenCode」',
    })
  } else {
    checks.push({
      id: 'opencode',
      label: 'OpenCode 运行时',
      ok: true,
      detail: 'healthy',
    })
  }

  const settings = getSettingsSnapshot()
  let modelOk = false
  let modelDetail = ''
  if (settings.channelMode === 'official') {
    modelOk = Boolean(settings.officialProvisioned && settings.model?.trim())
    modelDetail = modelOk
      ? `官方通道 · ${settings.model}`
      : settings.officialProvisioned
        ? '请选择官方通道模型'
        : '请先登录并开通官方通道（设置 → 模型通道）'
  } else {
    modelOk = Boolean(
      settings.apiKeySet && settings.model?.trim() && settings.baseUrl?.trim(),
    )
    modelDetail = modelOk
      ? `自定义 · ${settings.model}`
      : '请到设置填写自定义 API Key、Base URL，并确认模型 ID'
  }
  checks.push({
    id: 'model',
    label: '大模型配置',
    ok: modelOk,
    detail: modelDetail,
  })

  if (needsSearch(kind)) {
    const searchOk = settings.tavilyApiKeySet
    checks.push({
      id: 'search',
      label: '搜索服务配置',
      ok: searchOk,
      detail: searchOk
        ? `${settings.searchProvider || 'tavily'} Key 已配置`
        : '探索需要搜索 API。请到设置页填写 Tavily API Key',
    })
  }

  const mcpServers =
    runtime && healthy ? await runtime.getMcpServers() : []

  const leadStore = mcpOk(mcpServers, 'lead-store')
  checks.push({
    id: 'mcp-lead-store',
    label: 'MCP lead-store',
    ok: leadStore.ok,
    detail: leadStore.detail,
  })

  if (needsSearch(kind)) {
    const searchApi = mcpOk(mcpServers, 'search-api')
    checks.push({
      id: 'mcp-search-api',
      label: 'MCP search-api',
      ok: searchApi.ok,
      detail: searchApi.detail,
    })
  }

  if (needsChrome(kind)) {
    const chrome = mcpOk(mcpServers, 'chrome-devtools')
    checks.push({
      id: 'mcp-chrome',
      label: 'MCP chrome-devtools',
      ok: chrome.ok,
      detail: chrome.ok
        ? chrome.detail
        : `${chrome.detail || '未连接'}。请确认本机已安装 Google Chrome，并在设置中查看 MCP 状态`,
    })
  }

  const failed = checks.filter((c) => !c.ok)
  if (failed.length === 0) {
    return {
      ok: true,
      message: '环境检查通过',
      checks,
    }
  }

  const lines = failed.map((c) => `· ${c.label}：${c.detail || '未通过'}`)
  return {
    ok: false,
    message: `环境未就绪，请先完成配置后再启动 AI 任务：\n${lines.join('\n')}`,
    checks,
  }
}
