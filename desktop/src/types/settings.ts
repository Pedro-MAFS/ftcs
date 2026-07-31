export type ChannelMode = 'official' | 'custom'

/** @deprecated 仅迁移旧 .env；UI 不再使用 */
export type LegacyProviderId =
  | 'deepseek'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'custom'

export interface SettingsSnapshot {
  workspaceRoot: string
  channelMode: ChannelMode
  /** 是否已配置网关 sk（G1-02 写入） */
  officialProvisioned: boolean
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

export type SettingsCategory =
  | 'account'
  | 'model'
  | 'search'
  | 'workspace'
  | 'opencode'
  | 'about'

/** 官方通道可选模型（与网关白名单对齐） */
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
  custom: { models: [] as Array<{ id: string; label: string }>, small: [] as Array<{ id: string; label: string }> },
}
