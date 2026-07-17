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

export type ModelProviderId = 'anthropic' | 'openai' | 'google' | 'custom'

export interface SettingsSnapshot {
  workspaceRoot: string
  providerId: ModelProviderId
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
  providerId: ModelProviderId
  /** 若含掩码字符则保留原值 */
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

const PROVIDER_ENV_KEY: Record<Exclude<ModelProviderId, 'custom'>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
}

const CUSTOM_ENV_KEY = 'FTCS_CUSTOM_API_KEY'

const MODEL_CATALOG: Record<
  ModelProviderId,
  { models: Array<{ id: string; label: string }>; small: Array<{ id: string; label: string }> }
> = {
  anthropic: {
    models: [
      { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
    small: [
      { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    ],
  },
  openai: {
    models: [
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'openai/o3-mini', label: 'o3-mini' },
    ],
    small: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
    ],
  },
  google: {
    models: [
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    small: [
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  custom: {
    models: [],
    small: [],
  },
}

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

function detectProviderId(
  env: Record<string, string>,
  model: string,
): ModelProviderId {
  const stored = env.FTCS_PROVIDER_ID as ModelProviderId | undefined
  if (stored && ['anthropic', 'openai', 'google', 'custom'].includes(stored)) {
    return stored
  }
  if (model.startsWith('anthropic/')) return 'anthropic'
  if (model.startsWith('openai/')) return 'openai'
  if (model.startsWith('google/') || model.startsWith('gemini/')) return 'google'
  if (model.startsWith('custom/')) return 'custom'
  if (env.ANTHROPIC_API_KEY) return 'anthropic'
  if (env.OPENAI_API_KEY) return 'openai'
  if (env.GEMINI_API_KEY) return 'google'
  return 'anthropic'
}

function resolveApiKey(
  env: Record<string, string>,
  providerId: ModelProviderId,
): string {
  if (providerId === 'custom') {
    return env[CUSTOM_ENV_KEY] || env.OPENAI_API_KEY || ''
  }
  return env[PROVIDER_ENV_KEY[providerId]] || ''
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

function ensureModelPrefix(providerId: ModelProviderId, model: string): string {
  const trimmed = model.trim()
  if (!trimmed) {
    return MODEL_CATALOG[providerId].models[0]?.id ?? `${providerId}/default`
  }
  if (trimmed.includes('/')) return trimmed
  if (providerId === 'custom') return `custom/${trimmed}`
  return `${providerId}/${trimmed}`
}

export function getSettingsSnapshot(): SettingsSnapshot {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const opencodeConfigPath = getOpenCodeConfigPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const config = readJsonConfig(opencodeConfigPath)

  // 用户偏好以 .env 为准；旧工作区若只有 opencode.json，则回退读取一次便于迁移
  const model =
    env.FTCS_MODEL ||
    (typeof config.model === 'string' && config.model ? config.model : '') ||
    'anthropic/claude-sonnet-4-5'
  const smallModel =
    env.FTCS_SMALL_MODEL ||
    (typeof config.small_model === 'string' && config.small_model
      ? config.small_model
      : '') ||
    'anthropic/claude-haiku-4-5'

  const providerId =
    (['anthropic', 'openai', 'google', 'custom'].includes(env.FTCS_PROVIDER_ID)
      ? (env.FTCS_PROVIDER_ID as ModelProviderId)
      : undefined) || detectProviderId(env, model)
  const apiKey = resolveApiKey(env, providerId)
  const tavilyKey = env.TAVILY_API_KEY || ''

  const baseUrl = env.FTCS_MODEL_BASE_URL || ''

  const catalog = MODEL_CATALOG[providerId]

  return {
    workspaceRoot,
    providerId,
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
    modelOptions: catalog.models,
    smallModelOptions: catalog.small,
    opencodeConfigPath,
    envPath,
  }
}

export function saveSettings(input: SettingsSaveInput): SettingsSaveResult {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)

  const providerId = input.providerId
  const model = ensureModelPrefix(providerId, input.model)
  const smallModel = ensureModelPrefix(providerId, input.smallModel)

  const envUpdates: Record<string, string> = {
    FTCS_PROVIDER_ID: providerId,
    FTCS_MODEL: model,
    FTCS_SMALL_MODEL: smallModel,
    SEARCH_PROVIDER: input.searchProvider || 'tavily',
    SEARCH_DAILY_LIMIT: String(
      Number.isFinite(input.searchDailyLimit) && input.searchDailyLimit > 0
        ? Math.floor(input.searchDailyLimit)
        : 50,
    ),
  }

  // API Key：未改掩码则保留
  const prevApiKey = resolveApiKey(env, providerId)
  const nextApiKey =
    input.apiKey && !isMaskedSecret(input.apiKey) ? input.apiKey.trim() : prevApiKey

  if (providerId === 'custom') {
    envUpdates[CUSTOM_ENV_KEY] = nextApiKey
    // 兼容 OpenAI SDK 适配器
    envUpdates.OPENAI_API_KEY = nextApiKey
  } else {
    envUpdates[PROVIDER_ENV_KEY[providerId]] = nextApiKey
  }

  const prevTavily = env.TAVILY_API_KEY || ''
  envUpdates.TAVILY_API_KEY =
    input.tavilyApiKey && !isMaskedSecret(input.tavilyApiKey)
      ? input.tavilyApiKey.trim()
      : prevTavily

  const baseUrl = input.baseUrl.trim()
  if (providerId === 'custom' && baseUrl) {
    envUpdates.FTCS_MODEL_BASE_URL = baseUrl
  } else if (env.FTCS_MODEL_BASE_URL) {
    // 非自定义时清空自定义 base，避免干扰
    envUpdates.FTCS_MODEL_BASE_URL = ''
  }

  upsertEnvFile(envPath, envUpdates)

  // 同步进当前进程，便于立即重启 OpenCode / MCP 继承
  Object.assign(process.env, envUpdates)
  process.env.FTCS_WORKSPACE = workspaceRoot

  // 不再改写托管模板 opencode.json（模型等用户偏好只写 .env）

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

export function getModelCatalog(providerId: ModelProviderId) {
  return MODEL_CATALOG[providerId]
}
