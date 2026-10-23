import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getDocsInstallUrl } from '../config/site-origins'
import {
  isNodePortableBound,
  resolveConfiguredNode,
} from '../runtime/node-paths'
import { NODE_PORTABLE_INSTALL } from '../runtime/node-portable-install-types'
import {
  isOpenCodePortableBound,
  resolveConfiguredOpenCodeBin,
} from '../runtime/opencode-paths'

const execFileAsync = promisify(execFile)

export type EnvProbeStatus = 'ok' | 'missing' | 'outdated' | 'error'

export interface EnvProbeItem {
  id: 'node' | 'opencode' | 'builtin-browser' | 'officecli'
  label: string
  status: EnvProbeStatus
  detail: string
  /** 版本、路径等排障信息，只在诊断信息里展示 */
  diagnostic?: string
  /** 建议用户打开的安装说明或下载页 */
  installUrl?: string
  /** 可选依赖：不计入 EnvProbeResult.ok */
  optional?: boolean
}

export interface EnvProbeResult {
  ok: boolean
  checkedAt: string
  items: EnvProbeItem[]
}

const NODE_INSTALL_URL = 'https://nodejs.org/'

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
  const manualUrl = getDocsInstallUrl()

  if (isNodePortableBound()) {
    const configured = resolveConfiguredNode()
    if (!configured) {
      return {
        id: 'node',
        label: 'Node.js 22+',
        status: 'missing',
        detail:
          '应用内 Node 未就绪或文件已缺失。请重新一键准备 Node.js（下载到应用目录）。',
        installUrl: manualUrl,
      }
    }

    let version = ''
    try {
      const { stdout } = await execFileAsync(configured.exe, ['-v'], {
        windowsHide: true,
      })
      version = stdout.trim()
    } catch {
      return {
        id: 'node',
        label: 'Node.js 22+',
        status: 'error',
        detail: `${configured.exe} 存在但无法运行（可能被杀软隔离）。请重新准备。`,
        installUrl: manualUrl,
      }
    }

    const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10)
    if (!Number.isFinite(major) || major < NODE_PORTABLE_INSTALL.minMajorForOk) {
      return {
        id: 'node',
        label: 'Node.js 22+',
        status: 'outdated',
        detail: `应用内 Node ${version || '?'}（${configured.exe}），需要 ≥ ${NODE_PORTABLE_INSTALL.minMajorForOk}。`,
        installUrl: manualUrl,
      }
    }

    return {
      id: 'node',
      label: 'Node.js 22+',
      status: 'ok',
      detail: `${version} · ${configured.exe}（${configured.source}）`,
      installUrl: manualUrl,
    }
  }

  const { resolveBestNode } = await import('../runtime/resolve-node')
  const { bestOk, bestAny, all } = await resolveBestNode({
    minMajor: NODE_PORTABLE_INSTALL.minMajorForOk,
  })

  if (!bestAny) {
    return {
      id: 'node',
      label: 'Node.js 22+',
      status: 'missing',
      detail:
        '未找到 Node.js ≥22。可一键准备到应用目录（无需管理员权限），或自行安装后重新检测。',
      installUrl: manualUrl,
    }
  }

  if (!bestOk) {
    return {
      id: 'node',
      label: 'Node.js 22+',
      status: 'outdated',
      detail: `当前最高 ${bestAny.version}（${bestAny.exe}），需要 ≥ ${NODE_PORTABLE_INSTALL.minMajorForOk}。`,
      installUrl: manualUrl,
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
    installUrl: manualUrl,
  }
}

const AGENT_MISSING =
  '智能体服务未就绪。请点「一键安装」，或查看安装说明后再检测。'
const AGENT_BROKEN = '组件未能运行。请重新安装后再检测。'

async function probeOpenCode(): Promise<EnvProbeItem> {
  const manualUrl = getDocsInstallUrl()

  const describeConfigured = async (
    configured: { exe: string; source: string },
  ): Promise<EnvProbeItem> => {
    let version = ''
    try {
      const { stdout } = await execFileAsync(configured.exe, ['--version'], {
        windowsHide: true,
      })
      version = stdout.trim().split(/\r?\n/)[0] ?? ''
    } catch {
      return {
        id: 'opencode',
        label: '智能体服务',
        status: 'error',
        detail: AGENT_BROKEN,
        diagnostic: `${configured.exe} 存在但无法运行。`,
        installUrl: manualUrl,
      }
    }
    return {
      id: 'opencode',
      label: '智能体服务',
      status: 'ok',
      detail: '就绪',
      diagnostic: version
        ? `${version} · ${configured.exe}（${configured.source}）`
        : `${configured.exe}（${configured.source}）`,
      installUrl: manualUrl,
    }
  }

  if (isOpenCodePortableBound()) {
    const configured = resolveConfiguredOpenCodeBin()
    if (!configured) {
      return {
        id: 'opencode',
        label: '智能体服务',
        status: 'missing',
        detail: AGENT_MISSING,
        diagnostic: '应用目录中的组件缺失。',
        installUrl: manualUrl,
      }
    }
    return describeConfigured(configured)
  }

  const configured = resolveConfiguredOpenCodeBin()
  if (configured) {
    return describeConfigured(configured)
  }

  const bin = await findOnPath('opencode')
  if (!bin) {
    return {
      id: 'opencode',
      label: '智能体服务',
      status: 'missing',
      detail: AGENT_MISSING,
      installUrl: manualUrl,
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
    label: '智能体服务',
    status: 'ok',
    detail: '就绪',
    diagnostic: version ? `${version} · ${bin}` : bin,
    installUrl: manualUrl,
  }
}

async function probeBuiltinBrowser(): Promise<EnvProbeItem> {
  const { ensureBuiltinBrowser } = await import('../browser-runtime/index')
  try {
    let status = await ensureBuiltinBrowser()
    if (!status.ok && status.windowAlive) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      status = await ensureBuiltinBrowser()
    }
    return {
      id: 'builtin-browser',
      label: '内置浏览器',
      status: status.ok ? 'ok' : 'error',
      detail: status.detail,
      diagnostic: status.diagnostic,
    }
  } catch (err) {
    return {
      id: 'builtin-browser',
      label: '内置浏览器',
      status: 'error',
      detail: '内置浏览器没有打开。请点「重新检测」。',
      diagnostic: err instanceof Error ? err.message : String(err),
    }
  }
}

async function probeOfficeCli(): Promise<EnvProbeItem> {
  const { isOfficeCliInstallSupported, resolveConfiguredOfficeCli } =
    await import('../runtime/officecli-paths')
  const installUrl = getDocsInstallUrl()

  if (!isOfficeCliInstallSupported()) {
    return {
      id: 'officecli',
      label: 'OfficeCLI（可选）',
      status: 'missing',
      detail:
        '当前仅支持 Windows 64 位一键安装。可选：用于 Word / Excel / PPT 抽文本后再生成画像。',
      installUrl,
      optional: true,
    }
  }

  const configured = resolveConfiguredOfficeCli()
  if (!configured) {
    return {
      id: 'officecli',
      label: 'OfficeCLI（可选）',
      status: 'missing',
      detail:
        '未安装。可选：用于 Word / Excel / PPT 抽文本后再生成画像；不装不影响官网与 txt/md。',
      installUrl,
      optional: true,
    }
  }

  try {
    const { stdout } = await execFileAsync(configured.exe, ['--version'], {
      windowsHide: true,
      timeout: 30_000,
    })
    const version = stdout.trim().split(/\r?\n/)[0] ?? ''
    return {
      id: 'officecli',
      label: 'OfficeCLI（可选）',
      status: 'ok',
      detail: version
        ? `${version} · ${configured.exe}（${configured.source}）`
        : `${configured.exe}（${configured.source}）`,
      installUrl,
      optional: true,
    }
  } catch {
    return {
      id: 'officecli',
      label: 'OfficeCLI（可选）',
      status: 'error',
      detail: `文件存在但无法运行（可能被杀软隔离）：${configured.exe}。可重新安装。`,
      installUrl,
      optional: true,
    }
  }
}

/** 首次引导 / 设置页：探测本机 Node、OpenCode、内置浏览器、可选 OfficeCLI */
export async function probeEnvironment(): Promise<EnvProbeResult> {
  const items = await Promise.all([
    probeNode(),
    probeOpenCode(),
    probeBuiltinBrowser(),
    probeOfficeCli(),
  ])
  return {
    ok: items
      .filter((item) => !item.optional)
      .every((item) => item.status === 'ok'),
    checkedAt: new Date().toISOString(),
    items,
  }
}
