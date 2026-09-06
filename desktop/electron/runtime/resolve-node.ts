import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { NODE_INSTALL } from './node-install-types'
import {
  isNodePortableBound,
  resolveConfiguredNode,
} from './node-paths'

const execFileAsync = promisify(execFile)

export interface ResolvedNode {
  exe: string
  version: string
  major: number
  /** 来源说明，便于 UI / 日志 */
  source: string
}

function parseNodeMajor(versionRaw: string): number | null {
  const m = versionRaw.trim().match(/^v?(\d+)\./)
  if (!m) return null
  const major = Number.parseInt(m[1] ?? '', 10)
  return Number.isFinite(major) ? major : null
}

function parseSemverTuple(versionRaw: string): [number, number, number] {
  const m = versionRaw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!m) return [0, 0, 0]
  return [
    Number.parseInt(m[1] ?? '0', 10) || 0,
    Number.parseInt(m[2] ?? '0', 10) || 0,
    Number.parseInt(m[3] ?? '0', 10) || 0,
  ]
}

function compareSemverDesc(a: string, b: string): number {
  const ta = parseSemverTuple(a)
  const tb = parseSemverTuple(b)
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return tb[i] - ta[i]
  }
  return 0
}

export function readNodeInstallPathFromRegistry(): string | null {
  if (process.platform !== 'win32') return null
  try {
    const stdout = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Node.js', '/v', 'InstallPath'],
      { windowsHide: true, encoding: 'utf8' },
    )
    const match = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/i)
    const installPath = match?.[1]?.trim()
    return installPath || null
  } catch {
    return null
  }
}

/** 固定候选路径（含注册表），不查 PATH */
export function listFixedNodeExeCandidates(): Array<{ exe: string; source: string }> {
  const out: Array<{ exe: string; source: string }> = []
  const seen = new Set<string>()

  const add = (exe: string, source: string) => {
    const resolved = path.resolve(exe)
    const key = resolved.toLowerCase()
    if (!resolved || seen.has(key) || !fs.existsSync(resolved)) return
    seen.add(key)
    out.push({ exe: resolved, source })
  }

  if (process.env.FTCS_NODE_PATH) {
    add(process.env.FTCS_NODE_PATH, 'FTCS_NODE_PATH')
  }

  const registryPath = readNodeInstallPathFromRegistry()
  if (registryPath) {
    add(path.join(registryPath, 'node.exe'), 'registry InstallPath')
  }

  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
    const programFilesX86 =
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
    const localAppData = process.env.LOCALAPPDATA || ''
    add(path.join(programFiles, 'nodejs', 'node.exe'), 'Program Files')
    add(path.join(programFilesX86, 'nodejs', 'node.exe'), 'Program Files (x86)')
    add(
      path.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
      'LocalAppData Programs',
    )
  }

  return out
}

async function listPathNodeExeCandidates(): Promise<
  Array<{ exe: string; source: string }>
> {
  const out: Array<{ exe: string; source: string }> = []
  const seen = new Set<string>()

  const add = (exe: string) => {
    const resolved = path.resolve(exe)
    const key = resolved.toLowerCase()
    if (!resolved || seen.has(key) || !fs.existsSync(resolved)) return
    seen.add(key)
    out.push({ exe: resolved, source: 'PATH' })
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', ['node'], {
        windowsHide: true,
      })
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) add(trimmed)
      }
    } catch {
      // none
    }
  } else {
    try {
      const { stdout } = await execFileAsync('which', ['-a', 'node'])
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) add(trimmed)
      }
    } catch {
      try {
        const { stdout } = await execFileAsync('which', ['node'])
        if (stdout.trim()) add(stdout.trim())
      } catch {
        // none
      }
    }
  }

  return out
}

async function readNodeVersion(nodeExe: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(nodeExe, ['-v'], {
      windowsHide: true,
      timeout: 15_000,
    })
    const version = stdout.trim()
    return version || null
  } catch {
    return null
  }
}

/**
 * 在多份 Node 并存时（如 nvm 旧版在 PATH 前、官网安装在注册表路径）选出可用版本。
 * 优先：FTCS_NODE_PATH → 注册表/常见路径 → PATH；同优先级取版本最高且 major≥minMajor。
 */
export async function resolveBestNode(options?: {
  minMajor?: number
}): Promise<{
  bestOk: ResolvedNode | null
  bestAny: ResolvedNode | null
  all: ResolvedNode[]
}> {
  const minMajor = options?.minMajor ?? NODE_INSTALL.minMajorForOk

  if (isNodePortableBound()) {
    const configured = resolveConfiguredNode()
    if (!configured) {
      return { bestOk: null, bestAny: null, all: [] }
    }
    const version = await readNodeVersion(configured.exe)
    if (!version) {
      return { bestOk: null, bestAny: null, all: [] }
    }
    const major = parseNodeMajor(version)
    if (major == null) {
      return { bestOk: null, bestAny: null, all: [] }
    }
    const node: ResolvedNode = {
      exe: configured.exe,
      version,
      major,
      source: configured.source,
    }
    return {
      bestOk: major >= minMajor ? node : null,
      bestAny: node,
      all: [node],
    }
  }

  const candidates = [
    ...listFixedNodeExeCandidates(),
    ...(await listPathNodeExeCandidates()),
  ]

  // 去重（固定路径已优先）
  const deduped: Array<{ exe: string; source: string }> = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const key = c.exe.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }

  const all: ResolvedNode[] = []
  for (const c of deduped) {
    const version = await readNodeVersion(c.exe)
    if (!version) continue
    const major = parseNodeMajor(version)
    if (major == null) continue
    all.push({
      exe: c.exe,
      version,
      major,
      source: c.source,
    })
  }

  const okList = all
    .filter((n) => n.major >= minMajor)
    .sort((a, b) => {
      // 非 PATH 来源略优先（同一版本时更认官网/注册表安装）
      const sourceScore = (s: string) => (s === 'PATH' ? 1 : 0)
      const bySource = sourceScore(a.source) - sourceScore(b.source)
      if (bySource !== 0) return bySource
      return compareSemverDesc(a.version, b.version)
    })

  const bestOk = okList[0] ?? null
  const bestAny =
    [...all].sort((a, b) => compareSemverDesc(a.version, b.version))[0] ?? null

  return { bestOk, bestAny, all }
}

/**
 * 把合格 Node 目录插到 process.env.PATH 最前，供 OpenCode / npx / MCP 子进程使用。
 * @returns 注入的 Node 信息；若没有 ≥minMajor 则返回 null（不改 PATH）
 */
export async function ensurePreferredNodeOnPath(options?: {
  minMajor?: number
}): Promise<ResolvedNode | null> {
  const { bestOk } = await resolveBestNode(options)
  if (!bestOk) return null

  const dir = path.dirname(bestOk.exe)
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const current = process.env.PATH ?? process.env.Path ?? ''
  const parts = current.split(delimiter).filter(Boolean)
  const filtered = parts.filter(
    (p) => path.resolve(p).toLowerCase() !== path.resolve(dir).toLowerCase(),
  )
  const next = [dir, ...filtered].join(delimiter)
  process.env.PATH = next
  process.env.Path = next
  process.env.FTCS_RESOLVED_NODE = bestOk.exe
  return bestOk
}

/** 安装验证：私有模式下只认 resolveConfiguredNode */
export async function findAcceptableInstalledNode(): Promise<ResolvedNode | null> {
  if (isNodePortableBound()) {
    const configured = resolveConfiguredNode()
    if (!configured) return null
    const version = await readNodeVersion(configured.exe)
    if (!version) return null
    const major = parseNodeMajor(version)
    if (major == null || major < NODE_INSTALL.minMajorForOk) return null
    return {
      exe: configured.exe,
      version,
      major,
      source: configured.source,
    }
  }
  const { bestOk } = await resolveBestNode()
  return bestOk
}
