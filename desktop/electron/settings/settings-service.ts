import fs from 'node:fs'
import path from 'node:path'
import { dialog } from 'electron'
import {
  isMaskedSecret,
  maskSecret,
  readEnvFile,
  upsertEnvFile,
} from '../config/env-file'
import { getOpenCodeConfigPath, getWorkspaceRoot } from '../config/paths'
import {
  getDefaultTokenGatewayBaseUrl,
  getTokenGatewayBaseUrl,
} from '../gateway/gateway-config'
import { getOfficialModelsCache } from '../gateway/official-models-cache'
import { getOfficialUsageCache } from '../gateway/official-usage-cache'
import type { OfficialUsageSnapshot } from '../gateway/official-usage-cache'

export type ChannelMode = 'official' | 'custom'
export type OfficialModelsSource = 'gateway' | 'fallback' | 'none'

type LegacyProviderId =
  | 'deepseek'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'custom'

export interface SettingsSnapshot {
  workspaceRoot: string
  channelMode: ChannelMode
  officialProvisioned: boolean
  gatewayBaseUrl: string
  gatewayKeyMasked: string
  officialModelsSource: OfficialModelsSource
  officialModelsError?: string
  officialUsage: OfficialUsageSnapshot | null
  apiKeyMasked: string
  apiKeySet: boolean
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKeyMasked: string
  tavilyApiKeySet: boolean
  searchDailyLimit: number
  searchUsedToday: number
  modelOptions: Array<{ id: string; label: string }>
  smallModelOptions: Array<{ id: string; label: string }>
  opencodeConfigPath: string
  envPath: string
}

export interface SettingsSaveInput {
  channelMode: ChannelMode
  apiKey: string
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKey: string
  searchDailyLimit: number
}

export interface SettingsSaveResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

const OFFICIAL_MODEL_CATALOG = {
  models: [
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  ],
  small: [
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  ],
}

const LEGACY_PROVIDER_IDS: LegacyProviderId[] = [
  'deepseek',
  'anthropic',
  'openai',
  'google',
  'custom',
]

const LEGACY_PROVIDER_ENV_KEY: Record<Exclude<LegacyProviderId, 'custom'>, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
}

const CUSTOM_ENV_KEY = 'FTCS_CUSTOM_API_KEY'
const GATEWAY_KEY_ENV = 'FTCS_GATEWAY_API_KEY'
const CHANNEL_MODE_ENV = 'FTCS_CHANNEL_MODE'
const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com/v1'

function getEnvPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.env')
}

function readJsonConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) {
    return {
      $schema: 'https://opencode.ai/config.json',
    }
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
}

function readSearchUsage(workspaceRoot: string): number {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const usagePath = path.join(
    workspaceRoot,
    'data',
    'cache',
    'search',
    `usage-${y}${m}${d}.json`,
  )
  if (!fs.existsSync(usagePath)) return 0
  try {
    const data = JSON.parse(fs.readFileSync(usagePath, 'utf8')) as {
      search_calls?: number
    }
    return data.search_calls ?? 0
  } catch {
    return 0
  }
}

function hasSelfServeKey(env: Record<string, string>): boolean {
  return Boolean(
    env[CUSTOM_ENV_KEY] ||
      env.DEEPSEEK_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      env.OPENAI_API_KEY ||
      env.GEMINI_API_KEY,
  )
}

function parseChannelMode(raw: string | undefined): ChannelMode | null {
  if (raw === 'official' || raw === 'custom') return raw
  return null
}

/**
 * 解析通道模式；必要时写回迁移结果（不静默丢 Key）。
 */
function resolveChannelMode(
  envPath: string,
  env: Record<string, string>,
): { mode: ChannelMode; env: Record<string, string> } {
  const existing = parseChannelMode(env[CHANNEL_MODE_ENV])
  if (existing) {
    return { mode: existing, env }
  }

  const legacy = env.FTCS_PROVIDER_ID as LegacyProviderId | undefined
  const hasLegacyProvider =
    Boolean(legacy && LEGACY_PROVIDER_IDS.includes(legacy)) || hasSelfServeKey(env)

  const mode: ChannelMode = hasLegacyProvider ? 'custom' : 'official'
  const updates: Record<string, string> = {
    [CHANNEL_MODE_ENV]: mode,
  }

  if (legacy === 'deepseek' && env.DEEPSEEK_API_KEY && !env[CUSTOM_ENV_KEY]) {
    updates[CUSTOM_ENV_KEY] = env.DEEPSEEK_API_KEY
    if (!env.FTCS_MODEL_BASE_URL) {
      updates.FTCS_MODEL_BASE_URL = DEEPSEEK_DEFAULT_BASE
    }
  } else if (legacy && legacy !== 'custom' && LEGACY_PROVIDER_ENV_KEY[legacy]) {
    const keyName = LEGACY_PROVIDER_ENV_KEY[legacy]
    const keyVal = env[keyName]
    if (keyVal && !env[CUSTOM_ENV_KEY]) {
      updates[CUSTOM_ENV_KEY] = keyVal
    }
  } else if (!legacy && env.DEEPSEEK_API_KEY && !env[CUSTOM_ENV_KEY]) {
    updates[CUSTOM_ENV_KEY] = env.DEEPSEEK_API_KEY
    if (!env.FTCS_MODEL_BASE_URL) {
      updates.FTCS_MODEL_BASE_URL = DEEPSEEK_DEFAULT_BASE
    }
  }

  if (mode === 'custom') {
    updates.FTCS_PROVIDER_ID = 'custom'
  }

  upsertEnvFile(envPath, updates)
  Object.assign(process.env, updates)
  return { mode, env: { ...env, ...updates } }
}

function resolveCustomApiKey(env: Record<string, string>): string {
  return env[CUSTOM_ENV_KEY] || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || ''
}

function ensureModelId(channelMode: ChannelMode, model: string, fallback: string): string {
  const trimmed = model.trim()
  if (!trimmed) return fallback
  if (channelMode === 'official') {
    if (trimmed.includes('/')) return trimmed
    return `deepseek/${trimmed}`
  }
  if (trimmed.includes('/')) return trimmed
  return `custom/${trimmed}`
}

export function getSettingsSnapshot(): SettingsSnapshot {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const opencodeConfigPath = getOpenCodeConfigPath(workspaceRoot)
  let env = readEnvFile(envPath)
  const { mode: channelMode, env: migrated } = resolveChannelMode(envPath, env)
  env = migrated

  const config = readJsonConfig(opencodeConfigPath)
  const defaultModel = OFFICIAL_MODEL_CATALOG.models[0].id
  const defaultSmall = OFFICIAL_MODEL_CATALOG.small[0].id

  const model =
    env.FTCS_MODEL ||
    (typeof config.model === 'string' && config.model ? config.model : '') ||
    defaultModel
  const smallModel =
    env.FTCS_SMALL_MODEL ||
    (typeof config.small_model === 'string' && config.small_model
      ? config.small_model
      : '') ||
    defaultSmall

  const apiKey = channelMode === 'custom' ? resolveCustomApiKey(env) : ''
  const gatewayKey = (env[GATEWAY_KEY_ENV] || '').trim()
  const tavilyKey = env.TAVILY_API_KEY || ''
  const baseUrl = env.FTCS_MODEL_BASE_URL || ''
  const gatewayBaseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })
  const cache = getOfficialModelsCache()

  let modelOptions: Array<{ id: string; label: string }> = []
  let smallModelOptions: Array<{ id: string; label: string }> = []
  let officialModelsSource: OfficialModelsSource = 'none'
  let officialModelsError: string | undefined

  if (channelMode === 'official') {
    if (cache && cache.options.length > 0) {
      modelOptions = cache.options.map((o) => ({ id: o.id, label: o.label }))
      smallModelOptions = modelOptions
      officialModelsSource = cache.source
      officialModelsError = cache.error
    } else if (gatewayKey) {
      modelOptions = OFFICIAL_MODEL_CATALOG.models
      smallModelOptions = OFFICIAL_MODEL_CATALOG.small
      officialModelsSource = 'fallback'
      officialModelsError = cache?.error
    } else {
      officialModelsSource = 'none'
    }
  }

  return {
    workspaceRoot,
    channelMode,
    officialProvisioned: Boolean(gatewayKey),
    gatewayBaseUrl: gatewayBaseUrl || getDefaultTokenGatewayBaseUrl(),
    gatewayKeyMasked: maskSecret(gatewayKey),
    officialModelsSource,
    officialModelsError,
    officialUsage:
      channelMode === 'official' && gatewayKey ? getOfficialUsageCache() : null,
    apiKeyMasked: maskSecret(apiKey),
    apiKeySet: Boolean(apiKey),
    baseUrl,
    model,
    smallModel,
    searchProvider: env.SEARCH_PROVIDER || 'tavily',
    tavilyApiKeyMasked: maskSecret(tavilyKey),
    tavilyApiKeySet: Boolean(tavilyKey),
    searchDailyLimit: Number.parseInt(env.SEARCH_DAILY_LIMIT || '50', 10) || 50,
    searchUsedToday: readSearchUsage(workspaceRoot),
    modelOptions,
    smallModelOptions,
    opencodeConfigPath,
    envPath,
  }
}

export function saveSettings(input: SettingsSaveInput): SettingsSaveResult {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)

  const channelMode = input.channelMode === 'custom' ? 'custom' : 'official'
  const defaultModel = OFFICIAL_MODEL_CATALOG.models[0].id
  const defaultSmall = OFFICIAL_MODEL_CATALOG.small[0].id
  const model = ensureModelId(channelMode, input.model, defaultModel)
  const smallModel = ensureModelId(
    channelMode,
    input.smallModel || input.model,
    defaultSmall,
  )

  const envUpdates: Record<string, string> = {
    [CHANNEL_MODE_ENV]: channelMode,
    FTCS_MODEL: model,
    FTCS_SMALL_MODEL: smallModel,
    SEARCH_PROVIDER: input.searchProvider || 'tavily',
    SEARCH_DAILY_LIMIT: String(
      Number.isFinite(input.searchDailyLimit) && input.searchDailyLimit > 0
        ? Math.floor(input.searchDailyLimit)
        : 50,
    ),
  }

  if (channelMode === 'custom') {
    envUpdates.FTCS_PROVIDER_ID = 'custom'
    const prevApiKey = resolveCustomApiKey(env)
    const nextApiKey =
      input.apiKey && !isMaskedSecret(input.apiKey) ? input.apiKey.trim() : prevApiKey
    envUpdates[CUSTOM_ENV_KEY] = nextApiKey
    envUpdates.OPENAI_API_KEY = nextApiKey
    const baseUrl = input.baseUrl.trim()
    envUpdates.FTCS_MODEL_BASE_URL = baseUrl
  } else {
    // 官方：不改写自定义 Key；清空自定义 base 以免干扰（Key 保留）
    if (env.FTCS_MODEL_BASE_URL) {
      // keep FTCS_MODEL_BASE_URL for when user switches back — do not clear
    }
  }

  const prevTavily = env.TAVILY_API_KEY || ''
  envUpdates.TAVILY_API_KEY =
    input.tavilyApiKey && !isMaskedSecret(input.tavilyApiKey)
      ? input.tavilyApiKey.trim()
      : prevTavily

  upsertEnvFile(envPath, envUpdates)
  Object.assign(process.env, envUpdates)
  process.env.FTCS_WORKSPACE = workspaceRoot

  return {
    ok: true,
    message: '配置已保存。正在重启 OpenCode 使模型与密钥生效…',
    settings: getSettingsSnapshot(),
  }
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择工作区目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export function getOfficialModelCatalog() {
  return OFFICIAL_MODEL_CATALOG
}
