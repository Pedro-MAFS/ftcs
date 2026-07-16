export const IPC = {
  APP_GET_STATUS: 'app:get-status',
  OPENCODE_RESTART: 'opencode:restart',
  OPENCODE_GET_LOGS: 'opencode:get-logs',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PICK_WORKSPACE: 'settings:pick-workspace',
  LIBRARY_LIST: 'library:list',
  LIBRARY_ADD_WEBSITE: 'library:add-website',
  LIBRARY_DELETE_WEBSITE: 'library:delete-website',
  LIBRARY_LIST_DIR: 'library:list-dir',
  LIBRARY_MKDIR: 'library:mkdir',
  LIBRARY_UPLOAD_FILES: 'library:upload-files',
  LIBRARY_IMPORT_PATHS: 'library:import-paths',
  LIBRARY_PASTE_CLIPBOARD: 'library:paste-clipboard',
  LIBRARY_DELETE_ENTRY: 'library:delete-entry',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_RESTART */
  SIDECAR_RESTART: 'opencode:restart',
  /** @deprecated 兼容旧预加载命名，等同 OPENCODE_GET_LOGS */
  SIDECAR_GET_LOGS: 'opencode:get-logs',
} as const

export type OpenCodeRuntimeState = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

export interface OpenCodeRuntimeStatus {
  state: OpenCodeRuntimeState
  mode: 'sdk-server-client'
  port: number
  baseUrl: string
  pid?: number
  version?: string
  error?: string
  binaryPath?: string
  startedAt?: string
}

/** @deprecated 使用 OpenCodeRuntimeStatus */
export type SidecarStatus = OpenCodeRuntimeStatus
/** @deprecated 使用 OpenCodeRuntimeState */
export type SidecarState = OpenCodeRuntimeState

export interface McpServerStatus {
  name: string
  status: string
  error?: string
}

export interface AppStatus {
  workspaceRoot: string
  opencode: OpenCodeRuntimeStatus
  /** @deprecated 同 opencode */
  sidecar: OpenCodeRuntimeStatus
  opencodeHealthy: boolean
  mcpServers: McpServerStatus[]
  devMode: boolean
  requiresLocalOpenCode: boolean
}

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

export interface WebsiteItem {
  id: string
  title: string
  url: string
  relativePath: string
  createdAt?: string
  subtitle: string
}

export interface FileEntry {
  name: string
  kind: 'dir' | 'file'
  relativePath: string
  sizeBytes?: number
  modifiedAt?: string
}

export interface LibrarySnapshot {
  websites: WebsiteItem[]
  cwd: string
  entries: FileEntry[]
  filesRootLabel: string
}

export interface LibraryMutationResult {
  ok: boolean
  message: string
  snapshot: LibrarySnapshot
  imported?: number
  skipped?: string[]
}
