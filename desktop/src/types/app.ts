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

export interface McpServerStatus {
  name: string
  status: string
  error?: string
}

export interface AppStatus {
  workspaceRoot: string
  opencode: OpenCodeRuntimeStatus
  sidecar: OpenCodeRuntimeStatus
  opencodeHealthy: boolean
  mcpServers: McpServerStatus[]
  agentRunning: boolean
  devMode: boolean
  requiresLocalOpenCode: boolean
}

export interface OpenCodeActionResult {
  ok: boolean
  message: string
  status: AppStatus
}
