import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type EnvProbeStatus = 'ok' | 'missing' | 'outdated' | 'error'

export interface EnvProbeItem {
  id: 'node' | 'opencode' | 'chrome'
  label: string
  status: EnvProbeStatus
  detail: string
  /** 建议用户打开的安装说明或下载页 */
  installUrl?: string
}

export interface EnvProbeResult {
  ok: boolean
  checkedAt: string
  items: EnvProbeItem[]
}

const NODE_INSTALL_URL = 'https://nodejs.org/'
const CHROME_INSTALL_URL = 'https://www.google.com/chrome/'
const OPENCODE_DOCS_URL = 'https://ai-utills.com/ftcs/docs/install'

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

async function probeNode(): Promise<EnvProbeItem> {
  const { resolveBestNode } = await import('../runtime/resolve-node')
  const { bestOk, bestAny, all } = await resolveBestNode({ minMajor: 22 })

  if (!bestAny) {
    return {
      id: 'node',
      label: 'Node.js 22+',
      status: 'missing',
      detail:
        '未找到 node（PATH / 注册表 / 常见安装目录均无）。MCP 与 npx 依赖本机 Node。',
      installUrl: NODE_INSTALL_URL,
    }
  }

  if (!bestOk) {
    return {
      id: 'node',
      label: 'Node.js 22+',
      status: 'outdated',
      detail: `当前最高 ${bestAny.version}（${bestAny.exe}），需要 ≥ 22。`,
      installUrl: NODE_INSTALL_URL,
    }
  }

  const pathOnes = all.filter((n) => n.source === 'PATH')
  const pathHint =
    pathOnes.length > 0 &&
    pathOnes[0] &&
    pathOnes[0].exe.toLowerCase() !== bestOk.exe.toLowerCase()
      ? `；PATH 上另有 ${pathOnes[0].version}（${pathOnes[0].exe}），应用将优先使用合格版本`
      : ''

  return {
    id: 'node',
    label: 'Node.js 22+',
    status: 'ok',
    detail: `${bestOk.version} · ${bestOk.exe}（${bestOk.source}）${pathHint}`,
  }
}

async function probeOpenCode(): Promise<EnvProbeItem> {
  const { resolveConfiguredOpenCodeBin } = await import('../runtime/opencode-paths')
  const configured = resolveConfiguredOpenCodeBin()
  if (configured) {
    let version = ''
    try {
      const { stdout } = await execFileAsync(configured.exe, ['--version'], {
        windowsHide: true,
      })
      version = stdout.trim().split(/\r?\n/)[0] ?? ''
    } catch {
      // ignore
    }
    return {
      id: 'opencode',
      label: 'OpenCode CLI',
      status: 'ok',
      detail: version
        ? `${version} · ${configured.exe}（${configured.source}）`
        : `${configured.exe}（${configured.source}）`,
    }
  }

  const bin = await findOnPath('opencode')
  if (!bin) {
    return {
      id: 'opencode',
      label: 'OpenCode CLI',
      status: 'missing',
      detail:
        '未找到 opencode。可在本引导一键安装到应用目录（需先就绪 Node.js 22+），或手动：npm install -g opencode-ai',
      installUrl: OPENCODE_DOCS_URL,
    }
  }

  let version = ''
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], {
      windowsHide: true,
    })
    version = stdout.trim().split(/\r?\n/)[0] ?? ''
  } catch {
    // 有些发行版可能不支持 --version，有路径即可
  }

  return {
    id: 'opencode',
    label: 'OpenCode CLI',
    status: 'ok',
    detail: version ? `${version} · ${bin}` : bin,
  }
}

function chromeCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA || ''
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const programFilesX86 =
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'

  if (process.platform === 'win32') {
    return [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
}

async function probeChrome(): Promise<EnvProbeItem> {
  for (const candidate of chromeCandidates()) {
    if (candidate && fs.existsSync(candidate)) {
      return {
        id: 'chrome',
        label: 'Google Chrome',
        status: 'ok',
        detail: candidate,
      }
    }
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'reg',
        [
          'query',
          'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
          '/ve',
        ],
        { windowsHide: true },
      )
      const match = stdout.match(/REG_SZ\s+(.+\.exe)/i)
      const regPath = match?.[1]?.trim()
      if (regPath && fs.existsSync(regPath)) {
        return {
          id: 'chrome',
          label: 'Google Chrome',
          status: 'ok',
          detail: regPath,
        }
      }
    } catch {
      // ignore
    }
  }

  const onPath = await findOnPath(
    process.platform === 'win32' ? 'chrome' : 'google-chrome',
  )
  if (onPath) {
    return {
      id: 'chrome',
      label: 'Google Chrome',
      status: 'ok',
      detail: onPath,
    }
  }

  return {
    id: 'chrome',
    label: 'Google Chrome',
    status: 'missing',
    detail: '未检测到 Google Chrome。画像抓站与探索打开网页需要本机 Chrome。',
    installUrl: CHROME_INSTALL_URL,
  }
}

/** 首次引导 / 设置页：探测本机 Node、OpenCode、Chrome */
export async function probeEnvironment(): Promise<EnvProbeResult> {
  const items = await Promise.all([probeNode(), probeOpenCode(), probeChrome()])
  return {
    ok: items.every((item) => item.status === 'ok'),
    checkedAt: new Date().toISOString(),
    items,
  }
}
