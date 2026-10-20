import { getSettingsSnapshot } from '../settings/settings-service'
import type { OpenCodeRuntime } from '../opencode/runtime'
import { preparePlacesForPreflight } from '../gateway/places-official-runtime'
import {
  isPlacesGatewayReady,
  resolvePlacesStart,
  type PlacesStartProvider,
  type PlacesStartResolution,
} from './places-start'
import { resolveHunterStart } from './hunter-start'

export type { PlacesStartProvider, PlacesStartResolution }
export { isPlacesGatewayReady, resolvePlacesStart }
export { resolveHunterStart }

export type AgentPreflightKind =
  | 'extract-profile'
  | 'expand-keywords'
  | 'discover-leads'
  | 'discover-leads-r2'
  | 'discover-leads-r3'
  | 'score-and-dedupe'
  | 'draft-email'
  | 'enrich-lead-contacts'

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
  return (
    kind === 'discover-leads' ||
    kind === 'discover-leads-r2' ||
    kind === 'discover-leads-r3'
  )
}

function needsChrome(kind: AgentPreflightKind): boolean {
  return (
    kind === 'extract-profile' ||
    kind === 'discover-leads' ||
    kind === 'discover-leads-r2' ||
    kind === 'discover-leads-r3'
  )
}

function needsPlaces(kind: AgentPreflightKind): boolean {
  return kind === 'discover-leads-r3'
}

function needsHunter(kind: AgentPreflightKind): boolean {
  return kind === 'enrich-lead-contacts'
}

function mcpOk(
  servers: Array<{ name: string; status: string; error?: string }>,
  name: string,
): { ok: boolean; detail?: string } {
  const item = servers.find((s) => s.name === name)
  if (!item) {
    return { ok: false, detail: '服务未就绪，请稍后或重启应用' }
  }
  const status = (item.status || '').toLowerCase()
  if (status === 'connected') return { ok: true, detail: '已连接' }
  return {
    ok: false,
    detail: '服务未就绪，请稍后或重启应用',
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
      label: '其它任务',
      ok: false,
      detail: '请等待当前任务结束',
    })
  } else {
    checks.push({
      id: 'agent-idle',
      label: '其它任务',
      ok: true,
      detail: '没有其它任务在运行',
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
      label: '智能体服务',
      ok: false,
      detail:
        runtimeState === 'starting'
          ? '正在启动，请稍候再试'
          : '服务未就绪，请稍后或重启应用',
    })
  } else {
    checks.push({
      id: 'opencode',
      label: '智能体服务',
      ok: true,
      detail: '已就绪',
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
        : '请先登录并开通官方通道（设置 → 模型通道 → 开通官方通道）'
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
    let searchOk = false
    let searchDetail = ''
    if (settings.channelMode === 'official') {
      searchOk = Boolean(settings.officialProvisioned)
      searchDetail = searchOk
        ? '官方通道已包含搜索'
        : '探索需要搜索。请先登录并开通官方通道（设置 → 模型通道）'
    } else {
      searchOk = settings.tavilyApiKeySet
      searchDetail = searchOk
        ? `${settings.searchProvider || 'tavily'} Key 已配置`
        : '探索需要搜索 API。请到设置页填写 Tavily API Key'
    }
    checks.push({
      id: 'search',
      label: '搜索服务配置',
      ok: searchOk,
      detail: searchDetail,
    })
  }

  const mcpServers =
    runtime && healthy ? await runtime.getMcpServers() : []

  const leadStore = mcpOk(mcpServers, 'lead-store')
  checks.push({
    id: 'mcp-lead-store',
      label: '线索服务',
    ok: leadStore.ok,
    detail: leadStore.detail,
  })

  if (needsSearch(kind)) {
    const searchApi = mcpOk(mcpServers, 'search-api')
    checks.push({
      id: 'mcp-search-api',
      label: '搜索服务',
      ok: searchApi.ok,
      detail: searchApi.detail,
    })
  }

  if (needsChrome(kind)) {
    const chrome = mcpOk(mcpServers, 'chrome-devtools')
    checks.push({
      id: 'mcp-chrome',
      label: '浏览器',
      ok: chrome.ok,
      detail: chrome.ok
        ? chrome.detail
        : '服务未就绪，请稍后或重启应用',
    })
  }

  if (needsPlaces(kind)) {
    const places = await preparePlacesForPreflight()
    checks.push({
      id: 'places',
      label: '地图发现',
      ok: places.ok,
      detail: places.detail,
    })
    const placesApi = mcpOk(mcpServers, 'places-api')
    checks.push({
      id: 'mcp-places-api',
      label: '地图服务',
      ok: placesApi.ok,
      detail: placesApi.detail,
    })
  }

  if (needsHunter(kind)) {
    const hunter = resolveHunterStart(settings)
    checks.push({
      id: 'hunter',
      label: 'Hunter API Key',
      ok: hunter.ok,
      detail: hunter.detail,
    })
    const hunterApi = mcpOk(mcpServers, 'hunter-api')
    checks.push({
      id: 'mcp-hunter-api',
      label: '联系人服务',
      ok: hunterApi.ok,
      detail: hunterApi.detail,
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
    message: `还有步骤没准备好。请按下面的说明处理后再试。\n${lines.join('\n')}`,
    checks,
  }
}
