import { createOpencode } from '@opencode-ai/sdk/v2'
import type { Config, OpencodeClient } from '@opencode-ai/sdk/v2'
import fs from 'node:fs'
import type { OpenCodeRuntimeStatus } from '../ipc/types'
import { ensureWorkspaceDataDirs, loadWorkspaceEnv } from '../config/env-loader'
import { initializeWorkspace, ensureMcpServersReady } from '../config/workspace-init'
import {
  getDefaultOpenCodePort,
  getOpenCodeConfigPath,
  getOpenCodeXdgConfigHome,
  getWorkspaceRoot,
} from '../config/paths'
import { applyUserPrefsToOpenCodeConfig } from '../config/user-opencode-prefs'
import {
  ensureOpenCodeOnPath,
  fetchHealth,
  fetchMcpStatus,
  findAvailablePort,
  findPidOnPort,
  killProcessTree,
  readOpenCodeConfig,
} from './resolver'

const MAX_LOG_LINES = 200
const PORT_SCAN_RANGE = 20

type RuntimeServer = {
  url: string
  close(): void
  /** true = 本 App 负责退出时杀掉该 Server */
  owned: boolean
  pid?: number
}

/**
 * 使用官方 SDK v2 的 Server + Client 模式托管本机 OpenCode。
 * 暂不内嵌二进制：依赖系统 PATH（或 FTCS_OPENCODE_PATH 注入 PATH）。
 */
export class OpenCodeRuntime {
  private server: RuntimeServer | null = null
  private client: OpencodeClient | null = null
  private logs: string[] = []
  private status: OpenCodeRuntimeStatus
  private preferredPort: number
  private activePort: number
  private readonly previousCwd: string
  private abort: AbortController | null = null

  constructor(options?: { port?: number }) {
    this.preferredPort = options?.port ?? getDefaultOpenCodePort()
    this.activePort = this.preferredPort
    this.previousCwd = process.cwd()
    this.status = this.createIdleStatus()
  }

  getStatus(): OpenCodeRuntimeStatus {
    return { ...this.status }
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  getClient(): OpencodeClient | null {
    return this.client
  }

  async start(): Promise<OpenCodeRuntimeStatus> {
    if (this.status.state === 'running' && this.server && this.client) {
      return this.getStatus()
    }

    await this.stop()
    this.activePort = this.preferredPort
    this.status = {
      ...this.createIdleStatus(),
      state: 'starting',
      mode: 'sdk-server-client',
    }

    try {
      const workspaceRoot = getWorkspaceRoot()
      const init = initializeWorkspace(workspaceRoot)
      this.appendLog(`工作区初始化: ${init.reason}`)
      if (init.syncedManaged.length) {
        this.appendLog(`已同步: ${init.syncedManaged.join(', ')}`)
      }
      if (init.createdBootstrap.length) {
        this.appendLog(`已创建: ${init.createdBootstrap.join(', ')}`)
      }
      ensureWorkspaceDataDirs(workspaceRoot)

      // 多 Node 并存时先注入合格 Node，再构建 MCP / 启动 OpenCode
      const { ensurePreferredNodeOnPath } = await import('../runtime/resolve-node')
      const preferredNode = await ensurePreferredNodeOnPath()
      if (preferredNode) {
        this.appendLog(
          `Node: ${preferredNode.version} · ${preferredNode.exe}（${preferredNode.source}）`,
        )
      } else {
        this.appendLog('警告: 未解析到 Node.js ≥22，MCP/npx 可能失败')
      }

      const mcpReady = await ensureMcpServersReady(workspaceRoot, (line) =>
        this.appendLog(line),
      )
      if (mcpReady.built.length) {
        this.appendLog(`MCP 已构建: ${mcpReady.built.join(', ')}`)
      }
      if (mcpReady.errors.length) {
        this.appendLog(`MCP 构建告警: ${mcpReady.errors.join(' | ')}`)
      }

      const env = loadWorkspaceEnv(workspaceRoot)
      Object.assign(process.env, env)
      delete process.env.OPENCODE_SERVER_PASSWORD
      // 强制 MCP 子进程认准纯净工作区（勿落到仓库根）
      process.env.FTCS_WORKSPACE = workspaceRoot
      // loadWorkspaceEnv 可能改写 PATH，再次确保合格 Node 在最前
      await ensurePreferredNodeOnPath()

      const binaryPath = await ensureOpenCodeOnPath()
      const configPath = getOpenCodeConfigPath(workspaceRoot)
      const config = applyUserPrefsToOpenCodeConfig(
        rewriteMcpWorkspaceEnv(
          readOpenCodeConfig(configPath) as Config,
          workspaceRoot,
        ),
        process.env,
      )

      this.appendLog(`启动 OpenCode（SDK Server+Client）`)
      this.appendLog(`工作区: ${workspaceRoot}`)
      this.appendLog(`二进制: ${binaryPath}`)
      this.appendLog(`配置: ${configPath}`)
      if (typeof config.model === 'string') {
        this.appendLog(`模型: ${config.model}`)
      }

      process.chdir(workspaceRoot)
      this.applyIsolatedOpenCodeEnv(configPath)

      // 不复用端口上已有实例（旧进程可能带着本机全局 MCP）
      await this.reclaimPort(this.preferredPort, true)

      return await this.spawnOrFallback(binaryPath, config)
    } catch (err) {
      await this.stop()
      const message = err instanceof Error ? err.message : String(err)
      this.status = {
        ...this.createIdleStatus(),
        state: 'error',
        error: this.formatStartError(message),
      }
      this.appendLog(`启动失败: ${this.status.error}`)
      return this.getStatus()
    }
  }

  /**
   * 停止本 App 托管的 OpenCode。
   * 必须在 Electron before-quit 里用 preventDefault + await，否则进程会残留。
   */
  async stop(): Promise<void> {
    this.abort?.abort()
    this.abort = null

    const current = this.server
    this.server = null
    this.client = null

    if (current?.owned) {
      try {
        current.close()
      } catch (err) {
        this.appendLog(`SDK close 异常: ${err instanceof Error ? err.message : String(err)}`)
      }

      // SDK close 之后再保险 taskkill 一次（Windows 退出竞态常见）
      const pid = current.pid ?? (await findPidOnPort(this.activePort))
      if (pid) {
        this.appendLog(`清理 OpenCode 进程树 pid=${pid}`)
        await killProcessTree(pid)
      }
    }

    try {
      if (fs.existsSync(this.previousCwd)) {
        process.chdir(this.previousCwd)
      }
    } catch {
      // ignore
    }

    this.status = {
      state: 'stopped',
      mode: 'sdk-server-client',
      port: this.activePort,
      baseUrl: `http://127.0.0.1:${this.activePort}`,
      version: this.status.version,
      binaryPath: this.status.binaryPath,
    }
    this.appendLog('OpenCode 已停止')
  }

  async restart(): Promise<OpenCodeRuntimeStatus> {
    await this.stop()
    await this.reclaimPort(this.preferredPort, true)
    return this.start()
  }

  async getMcpServers(): Promise<Array<{ name: string; status: string; error?: string }>> {
    if (this.status.state !== 'running') return []
    return fetchMcpStatus(this.status.baseUrl)
  }

  async healthCheck(): Promise<boolean> {
    if (this.status.state !== 'running') return false
    const health = await fetchHealth(this.status.baseUrl)
    return health.ok
  }

  /**
   * 对单个 MCP 执行 disconnect → connect，用于失败后重连。
   */
  async reconnectMcp(name: string): Promise<{ ok: boolean; message: string }> {
    const client = this.client
    if (!client || this.status.state !== 'running') {
      return { ok: false, message: 'OpenCode 未运行，无法重连 MCP' }
    }
    const serverName = name.trim()
    if (!serverName) {
      return { ok: false, message: 'MCP 名称无效' }
    }

    try {
      this.appendLog(`MCP 重连: ${serverName}（disconnect）`)
      await client.mcp.disconnect({ name: serverName }).catch(() => undefined)
      const connected = await client.mcp.connect({ name: serverName })
      if (connected.error) {
        const msg =
          typeof connected.error === 'object' &&
          connected.error &&
          'message' in connected.error
            ? String((connected.error as { message?: string }).message)
            : `重连 ${serverName} 失败`
        this.appendLog(`MCP 重连失败: ${msg}`)
        return { ok: false, message: msg }
      }
      this.appendLog(`MCP 重连成功: ${serverName}`)
      return { ok: true, message: `${serverName} 已重连` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.appendLog(`MCP 重连异常: ${message}`)
      return { ok: false, message }
    }
  }

  private async spawnOrFallback(
    binaryPath: string,
    config: Config,
  ): Promise<OpenCodeRuntimeStatus> {
    const portsToTry = [this.preferredPort]
    for (let i = 1; i <= PORT_SCAN_RANGE; i++) {
      portsToTry.push(this.preferredPort + i)
    }

    let lastError = ''

    for (const port of portsToTry) {
      await this.reclaimPort(port, true)

      const available = await findAvailablePort(port)
      if (available == null) {
        this.appendLog(`端口 ${port} 仍被占用，跳过`)
        continue
      }

      try {
        this.appendLog(`尝试 createOpencode @ ${available}`)
        this.abort = new AbortController()
        const { client, server } = await createOpencode({
          hostname: '127.0.0.1',
          port: available,
          timeout: 60_000,
          signal: this.abort.signal,
          config,
        })

        this.activePort = available
        const pid = (await findPidOnPort(available)) ?? undefined
        this.server = {
          url: server.url,
          close: () => server.close(),
          owned: true,
          pid,
        }
        this.client = client

        const baseUrl = server.url.replace(/\/$/, '')
        const health = await fetchHealth(baseUrl)

        this.status = {
          state: 'running',
          mode: 'sdk-server-client',
          port: available,
          baseUrl,
          binaryPath,
          pid,
          version: health.version,
          startedAt: new Date().toISOString(),
          error: undefined,
        }
        this.appendLog(
          `已就绪: ${this.status.baseUrl}${health.version ? ` (v${health.version})` : ''}${pid ? ` pid=${pid}` : ''}`,
        )
        return this.getStatus()
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        this.appendLog(`端口 ${available} 启动失败: ${lastError.split('\n')[0]}`)

        if (this.isPortConflictError(lastError)) {
          await this.reclaimPort(available, true)
        }

        this.abort = null
      }
    }

    throw new Error(
      lastError ||
        `无法在 ${this.preferredPort}-${this.preferredPort + PORT_SCAN_RANGE} 启动 OpenCode Server`,
    )
  }

  /** 隔离本机 ~/.config/opencode，只认工作区 OPENCODE_CONFIG + SDK 内联配置 */
  private applyIsolatedOpenCodeEnv(configPath: string): void {
    const xdgHome = getOpenCodeXdgConfigHome()
    fs.mkdirSync(xdgHome, { recursive: true })

    process.env.OPENCODE_CONFIG = configPath
    // 新版 CLI 若支持则生效；当前稳定版尚未合入，靠 XDG 隔离兜底
    process.env.OPENCODE_DISABLE_GLOBAL_CONFIG = '1'
    process.env.XDG_CONFIG_HOME = xdgHome

    this.appendLog(`OpenCode 配置隔离: XDG_CONFIG_HOME=${xdgHome}`)
  }

  private createIdleStatus(): OpenCodeRuntimeStatus {
    return {
      state: 'idle',
      mode: 'sdk-server-client',
      port: this.activePort,
      baseUrl: `http://127.0.0.1:${this.activePort}`,
    }
  }

  /**
   * 清理端口占用。
   * force=true：健康实例也杀掉（避免复用带全局 MCP 的旧进程）。
   */
  private async reclaimPort(port: number, force = false): Promise<void> {
    const available = await findAvailablePort(port)
    if (available != null) return

    const health = await fetchHealth(`http://127.0.0.1:${port}`)
    if (health.ok && !force) return

    const pid = await findPidOnPort(port)
    if (!pid) {
      this.appendLog(`端口 ${port} 不可绑定且找不到 PID，稍后换端口`)
      return
    }

    this.appendLog(
      `端口 ${port} 被占用(pid=${pid}${health.ok ? ', 健康' : ', 无响应'})，正在清理…`,
    )
    await killProcessTree(pid)
    await new Promise((r) => setTimeout(r, 400))
  }

  private isPortConflictError(message: string): boolean {
    return /EADDRINUSE|already in use|地址.*使用|ServeError|Unexpected error|exited with code 1/i.test(
      message,
    )
  }

  private formatStartError(message: string): string {
    if (/ENOENT|not found|无法找到|找不到/i.test(message)) {
      return [
        '未找到本机 OpenCode CLI（SDK 需通过 PATH 启动 `opencode`）。',
        '请先安装: npm install -g opencode-ai',
        '或设置 FTCS_OPENCODE_PATH 指向可执行文件所在路径。',
        `原始错误: ${message}`,
      ].join('\n')
    }
    if (this.isPortConflictError(message)) {
      return [
        `端口 ${this.preferredPort} 已被占用或 OpenCode 返回 ServeError。`,
        '多为上次退出未清干净的残留进程。可执行: taskkill /F /IM opencode.exe',
        '然后点「重启 OpenCode」。',
        '',
        'OPENCODE_SERVER_PASSWORD 未设置只是警告，不是失败原因。',
        `原始错误: ${message}`,
      ].join('\n')
    }
    if (/Timeout waiting for server/i.test(message)) {
      return [
        'OpenCode Server 启动超时。',
        '请确认本机可执行: opencode serve --port 4096',
        `原始错误: ${message}`,
      ].join('\n')
    }
    return message
  }

  private appendLog(line: string): void {
    if (!line) return
    for (const part of line.split(/\r?\n/)) {
      if (!part.trim()) continue
      this.logs.push(`[${new Date().toISOString()}] ${part}`)
    }
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
    }
  }
}

/** 确保 MCP 子进程带上绝对 FTCS_WORKSPACE，并注入搜索相关密钥 */
function rewriteMcpWorkspaceEnv(config: Config, workspaceRoot: string): Config {
  const mcp = (config as { mcp?: Record<string, { environment?: Record<string, string> }> }).mcp
  if (!mcp || typeof mcp !== 'object') return config

  const searchEnv = {
    FTCS_WORKSPACE: workspaceRoot,
    SEARCH_PROVIDER: process.env.SEARCH_PROVIDER ?? 'tavily',
    SEARCH_DAILY_LIMIT: process.env.SEARCH_DAILY_LIMIT ?? '50',
    ...(process.env.TAVILY_API_KEY
      ? { TAVILY_API_KEY: process.env.TAVILY_API_KEY }
      : {}),
    ...(process.env.SERPAPI_API_KEY
      ? { SERPAPI_API_KEY: process.env.SERPAPI_API_KEY }
      : {}),
  }

  const nextMcp: Record<string, unknown> = {}
  for (const [name, server] of Object.entries(mcp)) {
    if (!server || typeof server !== 'object') {
      nextMcp[name] = server
      continue
    }
    const extra =
      name === 'search-api'
        ? searchEnv
        : { FTCS_WORKSPACE: workspaceRoot }
    nextMcp[name] = {
      ...server,
      environment: {
        ...(server.environment ?? {}),
        ...extra,
      },
    }
  }

  return { ...config, mcp: nextMcp } as Config
}
