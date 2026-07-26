import { execFile, spawn } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { writeUserPrefs } from '../config/user-prefs'
import {
  getOpenCodeRuntimePrefix,
  resolveOpenCodeBinFromPrefix,
} from './opencode-paths'
import {
  OPENCODE_INSTALL,
  type OpenCodeInstallProgress,
  type OpenCodeInstallResult,
} from './opencode-install-types'
import { ensurePreferredNodeOnPath, resolveBestNode } from './resolve-node'

const execFileAsync = promisify(execFile)

let installing = false

type NpmLaunch = {
  exe: string
  argsPrefix: string[]
  display: string
  nodeDir: string
  /**
   * Windows 回退到 npm.cmd 时需 shell，并对含空格路径加引号。
   * 主路径（node + npm-cli.js）保持 shell:false。
   */
  windowsShellQuoted?: boolean
}

type NpmInstallOutcome = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  /** 本地启动失败（路径/可执行文件），不应再换镜像重试 */
  localFailure?: boolean
}

function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

async function appendLog(logPath: string, chunk: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
  await fs.promises.appendFile(logPath, chunk, 'utf8')
}

function restartMessage(logPath: string): string {
  return `OpenCode CLI ${OPENCODE_INSTALL.version} 已安装到本机应用目录。请完全退出本应用后重新打开，再点「重新检测」。日志：${logPath}`
}

function withLogHint(message: string, logPath: string): string {
  return `${message}（日志：${logPath}）`
}

/**
 * 优先用 node + npm-cli.js（shell:false），避免 Windows 上
 * `C:\Program Files\...` 经 cmd 启动时被空格截断。
 */
function resolveNpmLaunch(nodeExe: string): NpmLaunch | null {
  const nodeDir = path.dirname(nodeExe)
  const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (fs.existsSync(npmCli)) {
    return {
      exe: nodeExe,
      argsPrefix: [npmCli],
      display: `${nodeExe} ${npmCli}`,
      nodeDir,
    }
  }

  if (process.platform === 'win32') {
    const cmd = path.join(nodeDir, 'npm.cmd')
    if (fs.existsSync(cmd)) {
      return {
        exe: cmd,
        argsPrefix: [],
        display: cmd,
        nodeDir,
        windowsShellQuoted: true,
      }
    }
    return null
  }

  const npm = path.join(nodeDir, 'npm')
  if (fs.existsSync(npm)) {
    return { exe: npm, argsPrefix: [], display: npm, nodeDir }
  }
  return null
}

function registryLabel(registry?: string): string {
  if (!registry) return '默认源'
  if (registry.includes('npmmirror')) return '国内镜像 npmmirror'
  if (registry.includes('npmjs')) return '官方源 npmjs'
  return registry
}

function withNodeDirOnPath(nodeDir: string): NodeJS.ProcessEnv {
  const sep = path.delimiter
  const prev = process.env.PATH ?? ''
  const parts = prev.split(sep).filter(Boolean)
  const normalized = path.resolve(nodeDir)
  const rest = parts.filter(
    (p) => path.resolve(p).toLowerCase() !== normalized.toLowerCase(),
  )
  return {
    ...process.env,
    PATH: [normalized, ...rest].join(sep),
  }
}

function looksLikeLocalLaunchFailure(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /not recognized as an internal or external command/i.test(text) ||
    /不是内部或外部命令/.test(text) ||
    /'c:\\program'/i.test(t) ||
    /\benoent\b/.test(t) ||
    /spawn .* enoent/i.test(text) ||
    (/npm-cli\.js/.test(t) && /not found|不存在|enoent/.test(t))
  )
}

async function runNpmInstall(options: {
  launch: NpmLaunch
  prefix: string
  registry?: string
  logPath: string
  onProgress?: (message: string) => void
}): Promise<NpmInstallOutcome> {
  const args = [
    ...options.launch.argsPrefix,
    'install',
    `${OPENCODE_INSTALL.packageName}@${OPENCODE_INSTALL.version}`,
    '--prefix',
    options.prefix,
    '--no-fund',
    '--no-audit',
    '--progress',
    '--loglevel',
    'info',
  ]
  if (options.registry) {
    args.push('--registry', options.registry)
  }

  const label = registryLabel(options.registry)
  const cmdline = `${options.launch.exe} ${args.join(' ')}`
  await appendLog(
    options.logPath,
    `npm: ${cmdline}\nregistry=${label}\nshell=false\n`,
  )
  options.onProgress?.(
    `正在通过 ${label} 下载并安装 OpenCode（可能需要几分钟）…`,
  )

  return new Promise((resolve) => {
    const env = withNodeDirOnPath(options.launch.nodeDir)
    // Windows + npm.cmd：必须 shell，且可执行路径加引号，否则 Program Files 会被截断
    const child = options.launch.windowsShellQuoted
      ? spawn(`"${options.launch.exe}"`, args, {
          windowsHide: true,
          shell: true,
          env,
        })
      : spawn(options.launch.exe, args, {
          windowsHide: true,
          shell: false,
          env,
        })

    let stdout = ''
    let stderr = ''
    let settled = false
    let lastUi = ''
    const startedAt = Date.now()

    const heartbeat = setInterval(() => {
      const sec = Math.round((Date.now() - startedAt) / 1000)
      options.onProgress?.(
        `正在通过 ${label} 安装 OpenCode…已等待 ${sec}s（详细输出见日志）`,
      )
    }, 5000)

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      clearInterval(heartbeat)
      child.kill()
      void appendLog(options.logPath, 'npm timeout, process killed\n')
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\nnpm install timed out after ${OPENCODE_INSTALL.installTimeoutMs}ms`,
      })
    }, OPENCODE_INSTALL.installTimeoutMs)

    const pushLine = async (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf8')
      if (stream === 'stdout') stdout += text
      else stderr += text
      await appendLog(options.logPath, text)

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      const interesting = [...lines]
        .reverse()
        .find(
          (l) =>
            /http|fetch|get |download|install|added|npm |warn|error|timing/i.test(
              l,
            ) && l.length < 180,
        )
      if (interesting && interesting !== lastUi) {
        lastUi = interesting
        options.onProgress?.(`${label}：${interesting}`)
      }
    }

    child.stdout?.on('data', (c: Buffer) => {
      void pushLine(c, 'stdout')
    })
    child.stderr?.on('data', (c: Buffer) => {
      void pushLine(c, 'stderr')
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearInterval(heartbeat)
      void appendLog(options.logPath, `npm spawn error: ${err.message}\n`)
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: err.message,
        localFailure: true,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearInterval(heartbeat)
      const exitCode = code ?? null
      const combined = `${stdout}\n${stderr}`
      void appendLog(
        options.logPath,
        `\nnpm finished exit=${exitCode}\n`,
      ).then(() => {
        resolve({
          ok: exitCode === 0,
          exitCode,
          stdout,
          stderr,
          localFailure:
            exitCode !== 0 && looksLikeLocalLaunchFailure(combined),
        })
      })
    })
  })
}

async function verifyOpenCodeBin(
  bin: string,
  logPath: string,
): Promise<{ ok: true; version: string } | { ok: false; detail: string }> {
  if (!fs.existsSync(bin)) {
    return { ok: false, detail: `未找到可执行文件：${bin}` }
  }
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], {
      windowsHide: true,
      timeout: 30_000,
      env: process.env,
    })
    const version =
      (stdout.trim().split(/\r?\n/)[0] ?? '').trim() || OPENCODE_INSTALL.version
    await appendLog(logPath, `verify: ${bin} -> ${version}\n`)
    return { ok: true, version }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    await appendLog(
      logPath,
      `verify --version failed (accept file exists): ${detail}\n`,
    )
    return { ok: true, version: OPENCODE_INSTALL.version }
  }
}

function npmFailureMessage(result: NpmInstallOutcome): string {
  if (result.localFailure) {
    return '无法启动本机 npm（常见原因：Node 安装路径含空格且安装器调用方式不正确）。请确认 Node.js 安装完整后重试，或按文档手动安装。'
  }
  if (result.stderr.includes('timed out')) {
    return 'npm 安装超时。请检查网络后重试，或按文档手动安装。'
  }
  return `npm 安装失败${result.exitCode != null ? `（退出码 ${result.exitCode}）` : ''}。请检查网络后重试，或按文档手动安装。`
}

export async function installOpenCodeRuntime(options?: {
  onProgress?: (p: OpenCodeInstallProgress) => void
}): Promise<OpenCodeInstallResult> {
  const emit = (phase: OpenCodeInstallProgress['phase'], message: string) => {
    options?.onProgress?.({ phase, message })
  }

  if (process.platform !== 'win32') {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '一键安装 OpenCode 目前仅支持 Windows。',
      manualUrl: OPENCODE_INSTALL.manualDocsUrl,
    }
  }

  if (installing) {
    return {
      ok: false,
      code: 'busy',
      message: '正在安装 OpenCode，请稍候。',
      manualUrl: OPENCODE_INSTALL.manualDocsUrl,
    }
  }

  installing = true
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logsDir(), `opencode-install-${stamp}.log`)

  try {
    emit('checking', '正在检查 Node.js 是否就绪…')
    await appendLog(
      logPath,
      `[${new Date().toISOString()}] start install ${OPENCODE_INSTALL.packageName}@${OPENCODE_INSTALL.version}\n`,
    )

    const preferred = await ensurePreferredNodeOnPath()
    const { bestOk } = await resolveBestNode()
    if (!preferred || !bestOk) {
      await appendLog(logPath, 'need-node: no acceptable Node >= 22\n')
      return {
        ok: false,
        code: 'need-node',
        message: withLogHint(
          'OpenCode 依赖 Node.js。请先完成 Node.js 一键安装（或确保已安装 ≥22），完全退出并重启本应用后，再安装 OpenCode。',
          logPath,
        ),
        logPath,
        manualUrl: OPENCODE_INSTALL.manualDocsUrl,
      }
    }

    await appendLog(
      logPath,
      `node: ${bestOk.version} · ${bestOk.exe}（${bestOk.source}）\n`,
    )
    emit(
      'checking',
      `已选用 Node ${bestOk.version}（${bestOk.source}）：${bestOk.exe}`,
    )

    const prefix = getOpenCodeRuntimePrefix()
    await fs.promises.mkdir(prefix, { recursive: true })
    await appendLog(logPath, `prefix: ${prefix}\n`)
    emit('installing', `安装目录：${prefix}`)

    const launch = resolveNpmLaunch(bestOk.exe)
    if (!launch) {
      await appendLog(
        logPath,
        `npm launcher not found beside node: ${path.dirname(bestOk.exe)}\n`,
      )
      return {
        ok: false,
        code: 'npm-failed',
        message: withLogHint(
          `未在 Node 安装目录找到 npm（${path.dirname(bestOk.exe)}）。请重新安装 Node.js 后重试。`,
          logPath,
        ),
        logPath,
        manualUrl: OPENCODE_INSTALL.manualDocsUrl,
      }
    }

    emit('installing', `使用 npm：${launch.display}`)
    await appendLog(logPath, `npm launch: ${launch.display}\n`)

    let npmResult = await runNpmInstall({
      launch,
      prefix,
      registry: OPENCODE_INSTALL.registryOfficial,
      logPath,
      onProgress: (message) => emit('installing', message),
    })

    if (!npmResult.ok && !npmResult.localFailure) {
      emit('installing', '官方源失败或超时，切换国内镜像重试…')
      await appendLog(logPath, 'official registry failed, retry mirror\n')
      npmResult = await runNpmInstall({
        launch,
        prefix,
        registry: OPENCODE_INSTALL.registryMirror,
        logPath,
        onProgress: (message) => emit('installing', message),
      })
    } else if (!npmResult.ok && npmResult.localFailure) {
      await appendLog(
        logPath,
        'local launch failure detected, skip mirror retry\n',
      )
    }

    if (!npmResult.ok) {
      return {
        ok: false,
        code: 'npm-failed',
        message: withLogHint(npmFailureMessage(npmResult), logPath),
        logPath,
        manualUrl: OPENCODE_INSTALL.manualDocsUrl,
      }
    }

    emit('verifying', '正在确认 OpenCode 可执行文件…')
    const bin = resolveOpenCodeBinFromPrefix(prefix)
    if (!bin) {
      await appendLog(logPath, 'verify: bin not found under prefix\n')
      return {
        ok: false,
        code: 'verify-failed',
        message: withLogHint(
          `安装完成但未找到 opencode 可执行文件（前缀：${prefix}）。`,
          logPath,
        ),
        logPath,
        manualUrl: OPENCODE_INSTALL.manualDocsUrl,
      }
    }

    emit('verifying', `找到二进制：${bin}`)
    const verified = await verifyOpenCodeBin(bin, logPath)
    if (!verified.ok) {
      return {
        ok: false,
        code: 'verify-failed',
        message: withLogHint(verified.detail, logPath),
        logPath,
        manualUrl: OPENCODE_INSTALL.manualDocsUrl,
      }
    }

    writeUserPrefs({ opencodePath: bin })
    process.env.FTCS_OPENCODE_PATH = bin
    await appendLog(logPath, `prefs.opencodePath=${bin}\n`)

    const message = restartMessage(logPath)
    emit('done', message)
    return {
      ok: true,
      version: verified.version,
      method: 'npm-prefix',
      binaryPath: bin,
      message,
      needsRestart: true,
      logPath,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await appendLog(logPath, `error: ${message}\n`).catch(() => undefined)
    emit('failed', message)
    return {
      ok: false,
      code: 'unknown',
      message: withLogHint(`安装失败：${message}`, logPath),
      logPath,
      manualUrl: OPENCODE_INSTALL.manualDocsUrl,
    }
  } finally {
    installing = false
  }
}
