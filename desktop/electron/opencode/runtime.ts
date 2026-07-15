import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk/v2'
import type { Config, OpencodeClient } from '@opencode-ai/sdk/v2'
import fs from 'node:fs'
import type { OpenCodeRuntimeStatus } from '../ipc/types'
import { ensureWorkspaceDataDirs, loadWorkspaceEnv } from '../config/env-loader'
import {
  getDefaultOpenCodePort,
  getOpenCodeConfigPath,
  getWorkspaceRoot,
} from '../config/paths'
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
      ensureWorkspaceDataDirs(workspaceRoot)

      const env = loadWorkspaceEnv(workspaceRoot)
      Object.assign(process.env, env)
      delete process.env.OPENCODE_SERVER_PASSWORD

      const binaryPath = await ensureOpenCodeOnPath()
      const configPath = getOpenCodeConfigPath(workspaceRoot)
      const config = readOpenCodeConfig(configPath) as Config

      this.appendLog(`启动 OpenCode（SDK Server+Client）`)
      this.appendLog(`工作区: ${workspaceRoot}`)
      this.appendLog(`二进制: ${binaryPath}`)
      this.appendLog(`配置: ${configPath}`)

      process.chdir(workspaceRoot)
      process.env.OPENCODE_CONFIG = configPath

      // 1) 优先复用健康实例（并接管所有权，退出时负责清理）
      const existing = await this.tryAttachExisting(this.preferredPort, binaryPath, true)
      if (existing) return existing

      // 2) 僵尸占端口但 health 不通：先清掉再启动
      await this.reclaimStalePort(this.preferredPort)

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
      ...this.status,
      state: this.status.state === 'error' ? 'error' : 'stopped',
      pid: undefined,
    }
  }

  async restart(): Promise<OpenCodeRuntimeStatus> {
    await this.stop()
    // 重启策略：杀掉旧实例后重新 spawn，不复用
    await this.reclaimStalePort(this.preferredPort)
    return this.start()
  }

  async getMcpServers(): Promise<Array<{ name: string; status: string }>> {
    if (this.status.state !== 'running') return []
    return fetchMcpStatus(this.status.baseUrl)
  }

  async healthCheck(): Promise<boolean> {
    if (this.status.state !== 'running') return false
    const health = await fetchHealth(this.status.baseUrl)
    return health.ok
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
      const attached = await this.tryAttachExisting(port, binaryPath, true)
      if (attached) return attached

      const available = await findAvailablePort(port)
      if (available == null) {
        this.appendLog(`端口 ${port} 被占用且不可复用，跳过`)
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
          const reused = await this.tryAttachExisting(available, binaryPath, true)
          if (reused) return reused
          await this.reclaimStalePort(available)
        }

        this.abort = null
      }
    }

    throw new Error(
      lastError ||
        `无法在 ${this.preferredPort}-${this.preferredPort + PORT_SCAN_RANGE} 启动 OpenCode Server`,
    )
  }

  private createIdleStatus(): OpenCodeRuntimeStatus {
    return {
      state: 'idle',
      mode: 'sdk-server-client',
      port: this.activePort,
      baseUrl: `http://127.0.0.1:${this.activePort}`,
    }
  }

  private async tryAttachExisting(
    port: number,
    binaryPath?: string,
    takeOwnership = true,
  ): Promise<OpenCodeRuntimeStatus | null> {
    const health = await fetchHealth(`http://127.0.0.1:${port}`)
    if (!health.ok) return null

    const pid = (await findPidOnPort(port)) ?? undefined
    this.activePort = port
    this.client = createOpencodeClient({ baseUrl: `http://127.0.0.1:${port}` })
    this.server = {
      url: `http://127.0.0.1:${port}`,
      owned: takeOwnership,
      pid,
      close: () => {
        // attach 场景无 SDK server 句柄；stop() 会用 pid/taskkill
      },
    }
    this.status = {
      state: 'running',
      mode: 'sdk-server-client',
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      binaryPath,
      pid,
      version: health.version,
      startedAt: new Date().toISOString(),
      error: undefined,
    }
    this.appendLog(
      `检测到端口 ${port} 已有健康 OpenCode，已接管（退出时将清理）${pid ? ` pid=${pid}` : ''}`,
    )
    return this.getStatus()
  }

  /** 端口占用但 health 不通（僵尸）时强制清理 */
  private async reclaimStalePort(port: number): Promise<void> {
    const available = await findAvailablePort(port)
    if (available != null) return

    const health = await fetchHealth(`http://127.0.0.1:${port}`)
    if (health.ok) return

    const pid = await findPidOnPort(port)
    if (!pid) {
      this.appendLog(`端口 ${port} 不可绑定且找不到 PID，稍后换端口`)
      return
    }

    this.appendLog(`端口 ${port} 被僵尸进程占用(pid=${pid})，正在清理…`)
    await killProcessTree(pid)
    // 给系统一点时间释放端口
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
