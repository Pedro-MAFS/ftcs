export type ChannelMode = 'official' | 'custom'

export type OfficialModelsSource = 'gateway' | 'fallback' | 'none'

/** @deprecated 仅迁移旧 .env；UI 不再使用 */
export type LegacyProviderId =
  | 'deepseek'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'custom'

export interface OfficialUsageSnapshot {
  balanceLi: number
  balanceYuan: number
  /** 不含 ¥ 前缀 */
  balanceDisplay: string
  liPerYuan: number
  keyPrefix?: string
  todayPromptTokens: number | null
  todayCompletionTokens: number | null
  fetchedAt: number
  error?: string
}

export interface SettingsSnapshot {
  workspaceRoot: string
  channelMode: ChannelMode
  /** 是否已配置网关 sk（G1-02 写入） */
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
  /** 自定义通道：若含掩码字符则保留原值；官方通道可忽略 */
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

export interface ProvisionOfficialResult {
  ok: boolean
  needLogin?: boolean
  message: string
  action?: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialModelsResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialUsageResult {
  ok: boolean
  message: string
  usage: OfficialUsageSnapshot | null
  settings: SettingsSnapshot
}

export interface OpenOfficialRechargeResult {
  ok: boolean
  needLogin?: boolean
  message: string
}

export type SettingsCategory =
  | 'account'
  | 'model'
  | 'search'
  | 'workspace'
  | 'opencode'
  | 'about'

/** 官方通道离线兜底（主路径为网关 GET /models） */
export const OFFICIAL_MODEL_CATALOG = {
  models: [
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  ],
  small: [
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  ],
}

/** @deprecated 使用 OFFICIAL_MODEL_CATALOG；保留空表避免旧 import 崩 */
export const MODEL_CATALOG = {
  official: OFFICIAL_MODEL_CATALOG,
  custom: {
    models: [] as Array<{ id: string; label: string }>,
    small: [] as Array<{ id: string; label: string }>,
  },
}
