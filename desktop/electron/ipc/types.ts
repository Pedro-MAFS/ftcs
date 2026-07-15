export const IPC = {
  APP_GET_STATUS: 'app:get-status',
  OPENCODE_RESTART: 'opencode:restart',
  OPENCODE_GET_LOGS: 'opencode:get-logs',
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
