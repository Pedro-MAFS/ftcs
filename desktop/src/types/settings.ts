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

export type GoogleProxyMode = 'off' | 'system' | 'manual'

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
  placesApiKeyMasked: string
  placesApiKeySet: boolean
  placesProvider: 'custom' | 'gateway'
  hunterApiKeySet: boolean
  hunterApiKeysMasked: string
  hunterApiKeyCount: number
  /** 补全联系人时是否验邮；未配置默认 true */
  hunterVerifyEmails: boolean
  googleProxyMode: GoogleProxyMode
  googleProxyManualUrl: string
  googleProxyEffectiveUrl: string
  searchDailyLimit: number
  searchUsedToday: number
  modelOptions: Array<{ id: string; label: string }>
  smallModelOptions: Array<{ id: string; label: string }>
  customModelSupportsImage: boolean
  opencodeConfigPath: string
  envPath: string
  /** 全局开发信行文风格（自由文本，可空） */
  emailDraftStylePrompt: string
  /** 任务完成 Windows 通知；默认 true */
  taskDoneNotificationEnabled: boolean
  /** 开机自启；默认 false */
  openAtLogin: boolean
  /** 界面主题：dark | light | system */
  uiThemeMode: 'dark' | 'light' | 'system'
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
  placesApiKey?: string
  hunterApiKeys?: string[]
  hunterVerifyEmails?: boolean
  googleProxyMode?: GoogleProxyMode
  googleProxyManualUrl?: string
  searchDailyLimit: number
  customModelSupportsImage?: boolean
  /** 省略则不修改；传入则校验后写入 prefs（允许空串清空） */
  emailDraftStylePrompt?: string
  /** 省略则不修改；任务完成 Windows 通知开关 */
  taskDoneNotificationEnabled?: boolean
  /** 省略则不修改；开机自启 */
  openAtLogin?: boolean
  /** 省略则不修改；界面主题 */
  uiThemeMode?: 'dark' | 'light' | 'system'
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

export type OpenOfficialPortalResult = OpenOfficialRechargeResult

export type SettingsCategory =
  | 'account'
  | 'model'
  | 'search'
  | 'explore'
  | 'integrations'
  | 'outreach'
  | 'appearance'
  | 'notifications'
  | 'workspace'
  | 'opencode'
  | 'about'

/** 官方通道离线兜底（主路径为网关 GET /models） */
export const OFFICIAL_MODEL_CATALOG = {
  models: [
    {
      id: 'deepseek/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'glm/glm-5.3-flash',
      label: 'GLM 5.3 Flash · 读图',
      ownedBy: 'glm',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
    {
      id: 'qwen/qwen3.8-flash',
      label: 'Qwen 3.8 Flash · 读图',
      ownedBy: 'qwen',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
  ],
  small: [
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'glm/glm-5.3-flash',
      label: 'GLM 5.3 Flash · 读图',
      ownedBy: 'glm',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
    {
      id: 'qwen/qwen3.8-flash',
      label: 'Qwen 3.8 Flash · 读图',
      ownedBy: 'qwen',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
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
