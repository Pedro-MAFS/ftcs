import fs from 'node:fs'
import path from 'node:path'
import { dialog } from 'electron'
import {
  isMaskedSecret,
  maskSecret,
  readEnvFile,
  removeEnvKeys,
  upsertEnvFile,
} from '../config/env-file'
import { getOpenCodeConfigPath, getWorkspaceRoot } from '../config/paths'
import {
  getDefaultTokenGatewayBaseUrl,
  getTokenGatewayBaseUrl,
} from '../gateway/gateway-config'
import {
  CUSTOM_VISION_ENV,
  formatEnvBool,
  parseEnvBool,
} from '../config/model-vision'
import { getOfficialModelsCache } from '../gateway/official-models-cache'
import { getOfficialUsageCache } from '../gateway/official-usage-cache'
import type { OfficialUsageSnapshot } from '../gateway/official-usage-cache'
import {
  formatHunterKeysEnv,
  parseHunterVerifyEmails,
  readHunterKeysFromEnv,
  resolveHunterApiKeysSlots,
  HUNTER_API_KEYS_MAX,
} from './hunter-keys'
import {
  normalizeEmailDraftStylePrompt,
  resolveEmailDraftStylePrompt,
} from './email-draft-style'
import { resolveTaskDoneNotificationEnabled } from '../notify/task-done-notify-logic'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import {
  GOOGLE_PROXY_MODE_ENV,
  GOOGLE_PROXY_RESOLVED_ENV,
  GOOGLE_PROXY_URL_ENV,
  type GoogleProxyMode,
  parseGoogleProxyMode,
} from '../config/google-proxy'

export type ChannelMode = 'official' | 'custom'
export type OfficialModelsSource = 'gateway' | 'fallback' | 'none'

type LegacyProviderId =
  | 'deepseek'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'custom'

export type PlacesProvider = 'custom' | 'gateway'

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
  placesApiKeyMasked: string
  placesApiKeySet: boolean
  placesProvider: PlacesProvider
  /** Hunter BYOK：至少一个 Key */
  hunterApiKeySet: boolean
  /** 各 Key 掩码后换行拼接，供 textarea 回显 */
  hunterApiKeysMasked: string
  hunterApiKeyCount: number
  /** 补全联系人时是否验邮；未配置默认 true */
  hunterVerifyEmails: boolean
  /** Google Places 出站代理：off | system | manual */
  googleProxyMode: GoogleProxyMode
  /** 手动代理 URL（如 http://127.0.0.1:7890） */
  googleProxyManualUrl: string
  /** 上次启动解析到的有效代理（只读展示） */
  googleProxyEffectiveUrl: string
  searchDailyLimit: number
  searchUsedToday: number
  modelOptions: Array<{ id: string; label: string }>
  smallModelOptions: Array<{ id: string; label: string }>
  /** 自定义通道：默认/轻量模型是否声明 OpenCode 读图能力 */
  customModelSupportsImage: boolean
  opencodeConfigPath: string
  envPath: string
  /** 全局开发信行文风格（自由文本，可空） */
  emailDraftStylePrompt: string
  /** 任务完成 Windows 通知；默认 true */
  taskDoneNotificationEnabled: boolean
}

export interface SettingsSaveInput {
  channelMode: ChannelMode
  apiKey: string
  baseUrl: string
  model: string
  smallModel: string
  searchProvider: string
  tavilyApiKey: string
  /** 省略则不修改；空字符串且非掩码则清除 */
  placesApiKey?: string
  /** 省略则不修改；空数组则清除；各槽位可为掩码（保留对应原 Key）或明文 */
  hunterApiKeys?: string[]
  /** 补全联系人是否验邮；写入 HUNTER_VERIFY_EMAILS */
  hunterVerifyEmails?: boolean
  googleProxyMode?: GoogleProxyMode
  googleProxyManualUrl?: string
  searchDailyLimit: number
  /** 自定义通道：勾选后写入 OpenCode modalities 以支持 Read 图片 */
  customModelSupportsImage?: boolean
  /** 省略则不修改；传入则校验后写入 prefs（允许空串清空） */
  emailDraftStylePrompt?: string
  /** 省略则不修改；任务完成 Windows 通知开关 */
  taskDoneNotificationEnabled?: boolean
}

export interface SettingsSaveResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

import { OFFICIAL_MODEL_CATALOG } from '../gateway/official-model-catalog'

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
const PLACES_KEY_ENV = 'GOOGLE_PLACES_API_KEY'
const PLACES_PROVIDER_ENV = 'PLACES_PROVIDER'
const HUNTER_KEYS_ENV = 'HUNTER_API_KEYS'
const HUNTER_KEY_ENV = 'HUNTER_API_KEY'
const HUNTER_VERIFY_EMAILS_ENV = 'HUNTER_VERIFY_EMAILS'
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
  const placesKey = env[PLACES_KEY_ENV] || ''
  const placesProvider: PlacesProvider =
    env[PLACES_PROVIDER_ENV] === 'gateway' ? 'gateway' : 'custom'
  const hunterKeys = readHunterKeysFromEnv(env)
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
    searchProvider:
      channelMode === 'official' ? 'gateway' : env.SEARCH_PROVIDER || 'tavily',
    tavilyApiKeyMasked: maskSecret(tavilyKey),
    tavilyApiKeySet: Boolean(tavilyKey),
    placesApiKeyMasked: maskSecret(placesKey),
    placesApiKeySet: Boolean(placesKey),
    placesProvider,
    hunterApiKeySet: hunterKeys.length > 0,
    hunterApiKeysMasked: hunterKeys.map((key) => maskSecret(key)).join('\n'),
    hunterApiKeyCount: hunterKeys.length,
    hunterVerifyEmails: parseHunterVerifyEmails(env[HUNTER_VERIFY_EMAILS_ENV]),
    googleProxyMode: parseGoogleProxyMode(env[GOOGLE_PROXY_MODE_ENV]),
    googleProxyManualUrl: env[GOOGLE_PROXY_URL_ENV] || '',
    googleProxyEffectiveUrl: process.env[GOOGLE_PROXY_RESOLVED_ENV] || '',
    searchDailyLimit:
      channelMode === 'official'
        ? 999999
        : Number.parseInt(env.SEARCH_DAILY_LIMIT || '50', 10) || 50,
    searchUsedToday: readSearchUsage(workspaceRoot),
    modelOptions,
    smallModelOptions,
    customModelSupportsImage: parseEnvBool(env[CUSTOM_VISION_ENV]),
    opencodeConfigPath,
    envPath,
    emailDraftStylePrompt: resolveEmailDraftStylePrompt(
      readUserPrefs().emailDraftStylePrompt,
    ),
    taskDoneNotificationEnabled: resolveTaskDoneNotificationEnabled(
      readUserPrefs().taskDoneNotificationEnabled,
    ),
  }
}

export function saveSettings(input: SettingsSaveInput): SettingsSaveResult {
  if (input.emailDraftStylePrompt !== undefined) {
    const normalized = normalizeEmailDraftStylePrompt(input.emailDraftStylePrompt)
    if (!normalized.ok) {
      return {
        ok: false,
        message: normalized.message,
        settings: getSettingsSnapshot(),
      }
    }
    writeUserPrefs({ emailDraftStylePrompt: normalized.value })
  }

  if (input.taskDoneNotificationEnabled !== undefined) {
    writeUserPrefs({
      taskDoneNotificationEnabled: Boolean(input.taskDoneNotificationEnabled),
    })
  }

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

  // 官方搜索走网关；自定义仍 Tavily（docs/15 D2）
  const searchProvider =
    channelMode === 'official' ? 'gateway' : input.searchProvider || 'tavily'
  const envUpdates: Record<string, string> = {
    [CHANNEL_MODE_ENV]: channelMode,
    FTCS_MODEL: model,
    FTCS_SMALL_MODEL: smallModel,
    SEARCH_PROVIDER: searchProvider,
    SEARCH_DAILY_LIMIT: String(
      channelMode === 'official'
        ? 999999
        : Number.isFinite(input.searchDailyLimit) && input.searchDailyLimit > 0
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
    envUpdates[CUSTOM_VISION_ENV] = formatEnvBool(Boolean(input.customModelSupportsImage))
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

  const prevPlaces = env[PLACES_KEY_ENV] || ''
  let clearPlacesKey = false
  if (input.placesApiKey === undefined) {
    if (prevPlaces) {
      envUpdates[PLACES_KEY_ENV] = prevPlaces
    }
  } else if (isMaskedSecret(input.placesApiKey)) {
    if (prevPlaces) {
      envUpdates[PLACES_KEY_ENV] = prevPlaces
    }
  } else if (!input.placesApiKey.trim()) {
    clearPlacesKey = true
  } else {
    envUpdates[PLACES_KEY_ENV] = input.placesApiKey.trim()
  }
  envUpdates[PLACES_PROVIDER_ENV] = 'custom'

  const prevHunterKeys = readHunterKeysFromEnv(env)
  let clearHunterKeys = false
  if (input.hunterApiKeys === undefined) {
    if (prevHunterKeys.length > 0) {
      envUpdates[HUNTER_KEYS_ENV] = formatHunterKeysEnv(prevHunterKeys)
    }
  } else {
    const nextKeys = resolveHunterApiKeysSlots(
      input.hunterApiKeys,
      prevHunterKeys,
    ).slice(0, HUNTER_API_KEYS_MAX)
    if (nextKeys.length === 0) {
      clearHunterKeys = true
    } else {
      envUpdates[HUNTER_KEYS_ENV] = formatHunterKeysEnv(nextKeys)
    }
  }

  if (input.hunterVerifyEmails !== undefined) {
    envUpdates[HUNTER_VERIFY_EMAILS_ENV] = formatEnvBool(input.hunterVerifyEmails)
  } else if (env[HUNTER_VERIFY_EMAILS_ENV]) {
    envUpdates[HUNTER_VERIFY_EMAILS_ENV] = env[HUNTER_VERIFY_EMAILS_ENV]
  } else {
    envUpdates[HUNTER_VERIFY_EMAILS_ENV] = formatEnvBool(true)
  }

  if (input.googleProxyMode !== undefined) {
    envUpdates[GOOGLE_PROXY_MODE_ENV] = parseGoogleProxyMode(input.googleProxyMode)
  } else if (env[GOOGLE_PROXY_MODE_ENV]) {
    envUpdates[GOOGLE_PROXY_MODE_ENV] = env[GOOGLE_PROXY_MODE_ENV]
  } else {
    envUpdates[GOOGLE_PROXY_MODE_ENV] = 'system'
  }

  if (input.googleProxyManualUrl !== undefined) {
    envUpdates[GOOGLE_PROXY_URL_ENV] = input.googleProxyManualUrl.trim()
  } else if (env[GOOGLE_PROXY_URL_ENV]) {
    envUpdates[GOOGLE_PROXY_URL_ENV] = env[GOOGLE_PROXY_URL_ENV]
  }

  upsertEnvFile(envPath, envUpdates)
  if (clearPlacesKey) {
    removeEnvKeys(envPath, [PLACES_KEY_ENV])
    delete process.env[PLACES_KEY_ENV]
  }
  if (clearHunterKeys) {
    removeEnvKeys(envPath, [HUNTER_KEYS_ENV, HUNTER_KEY_ENV])
    delete process.env[HUNTER_KEYS_ENV]
    delete process.env[HUNTER_KEY_ENV]
  } else if (envUpdates[HUNTER_KEYS_ENV]) {
    // 规范化后删除遗留单 Key，避免 provider 合并重复
    removeEnvKeys(envPath, [HUNTER_KEY_ENV])
    delete process.env[HUNTER_KEY_ENV]
  }
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

export { getOfficialModelCatalog, OFFICIAL_MODEL_CATALOG } from '../gateway/official-model-catalog'
