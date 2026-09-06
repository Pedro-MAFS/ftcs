import { execFile } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  isOpenCodePortableBound,
  resolveConfiguredOpenCodeBin,
} from '../runtime/opencode-paths'

const execFileAsync = promisify(execFile)

/**
 * 确保系统能解析到 `opencode` 命令（SDK 固定 spawn 命令名 `opencode`）。
 * 优先：prefs / FTCS_OPENCODE_PATH / userData 本地前缀，再 PATH。
 */
export async function ensureOpenCodeOnPath(): Promise<string> {
  const configured = resolveConfiguredOpenCodeBin()
  if (configured) {
    prependPathDir(path.dirname(configured.exe))
    process.env.FTCS_OPENCODE_PATH = configured.exe
    return configured.exe
  }

  if (!isOpenCodePortableBound()) {
    const fromPath = await findOnPath('opencode')
    if (fromPath) return fromPath
  }

  throw new Error(
    [
      '未找到 OpenCode CLI。',
      '请在应用引导中一键准备 OpenCode，或设置环境变量 FTCS_OPENCODE_PATH。',
    ].join('\n'),
  )
}

function prependPathDir(dir: string): void {
  const delimiter = path.delimiter
  const current = process.env.PATH ?? process.env.Path ?? ''
  const parts = current.split(delimiter).filter(Boolean)
  if (!parts.includes(dir)) {
    process.env.PATH = [dir, ...parts].join(delimiter)
  }
}

async function findOnPath(command: string): Promise<string | null> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', [command], {
        windowsHide: true,
      })
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      return first ?? null
    } catch {
      return null
    }
  }

  try {
    const { stdout } = await execFileAsync('which', [command])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export function readOpenCodeConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`缺少 OpenCode 配置: ${configPath}`)
  }
  const raw = fs.readFileSync(configPath, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

export async function fetchHealth(
  baseUrl: string,
  timeoutMs = 2500,
): Promise<{ ok: boolean; version?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/global/health`, {
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { healthy?: boolean; version?: string }
    return {
      ok: data.healthy !== false,
      version: data.version,
    }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

/** 端口可绑定则返回该端口；已被占用返回 null */
export async function findAvailablePort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(null))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(port))
    })
  })
}

/** 查找占用指定本地端口的 PID（Windows / Unix） */
export async function findPidOnPort(port: number): Promise<number | null> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'cmd.exe',
        ['/d', '/s', '/c', `netstat -ano | findstr :${port}`],
        { windowsHide: true },
      )
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number.parseInt(parts[parts.length - 1] ?? '', 10)
        if (Number.isFinite(pid) && pid > 0) return pid
      }
    } catch {
      return null
    }
    return null
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`])
    const pid = Number.parseInt(stdout.trim().split(/\n/)[0] ?? '', 10)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/** 强制结束进程树（退出清理用） */
export async function killProcessTree(pid: number): Promise<void> {
  if (!pid || pid <= 0) return
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
      })
    } catch {
      // 进程可能已退出
    }
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // ignore
  }
}

export async function fetchMcpStatus(
  baseUrl: string,
): Promise<Array<{ name: string; status: string; error?: string }>> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/mcp`)
    if (!res.ok) return []
    const data = (await res.json()) as Record<
      string,
      { status?: string; error?: string }
    >
    return Object.entries(data).map(([name, info]) => ({
      name,
      status: info.status ?? 'unknown',
      ...(info.error ? { error: info.error } : {}),
    }))
  } catch {
    return []
  }
}
