import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { NODE_INSTALL } from './node-install-types'

const execFileAsync = promisify(execFile)

export async function resolveWingetPath(): Promise<string | null> {
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe'),
    'winget.exe',
    'winget',
  ]

  for (const candidate of candidates) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (fs.existsSync(candidate)) return candidate
      continue
    }
    try {
      const { stdout } = await execFileAsync('where.exe', [candidate], {
        windowsHide: true,
      })
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (first && fs.existsSync(first)) return first
    } catch {
      // continue
    }
  }
  return null
}

export interface WingetInstallOutcome {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  elevationDenied?: boolean
}

export async function installNodeWithWinget(
  wingetPath: string,
): Promise<WingetInstallOutcome> {
  const args = [
    'install',
    '--id',
    NODE_INSTALL.wingetPackageId,
    '--version',
    NODE_INSTALL.version,
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--disable-interactivity',
  ]

  try {
    const { stdout, stderr } = await execFileAsync(wingetPath, args, {
      windowsHide: true,
      timeout: NODE_INSTALL.installTimeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    })
    return {
      ok: true,
      exitCode: 0,
      stdout: stdout || '',
      stderr: stderr || '',
    }
  } catch (err) {
    const e = err as {
      code?: string
      status?: number
      stdout?: string
      stderr?: string
      message?: string
    }
    const stdout = String(e.stdout || '')
    const stderr = String(e.stderr || e.message || '')
    const combined = `${stdout}\n${stderr}`.toLowerCase()
    const elevationDenied =
      combined.includes('access is denied') ||
      combined.includes('拒绝访问') ||
      combined.includes('elevation') ||
      e.status === 5

    // winget 已安装时常返回非 0，但文案含 already installed
    const already =
      combined.includes('already installed') ||
      combined.includes('已安装') ||
      combined.includes('no available upgrade')

    return {
      ok: already || e.status === 0,
      exitCode: typeof e.status === 'number' ? e.status : null,
      stdout,
      stderr,
      elevationDenied: elevationDenied && !already,
    }
  }
}
