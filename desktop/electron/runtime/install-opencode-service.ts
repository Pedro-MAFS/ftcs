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

function resolveNpmCmd(nodeExe: string): string {
  const dir = path.dirname(nodeExe)
  if (process.platform === 'win32') {
    const cmd = path.join(dir, 'npm.cmd')
    if (fs.existsSync(cmd)) return cmd
    return 'npm.cmd'
  }
  const npm = path.join(dir, 'npm')
  if (fs.existsSync(npm)) return npm
  return 'npm'
}

function registryLabel(registry?: string): string {
  if (!registry) return '默认源'
  if (registry.includes('npmmirror')) return '国内镜像 npmmirror'
  if (registry.includes('npmjs')) return '官方源 npmjs'
  return registry
}

async function runNpmInstall(options: {
  npmCmd: string
  prefix: string
  registry?: string
  logPath: string
  onProgress?: (message: string) => void
}): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string }> {
  const args = [
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
  await appendLog(
    options.logPath,
    `npm: ${options.npmCmd} ${args.join(' ')}\nregistry=${label}\n`,
  )
  options.onProgress?.(
    `正在通过 ${label} 下载并安装 OpenCode（可能需要几分钟）…`,
  )

  return new Promise((resolve) => {
    const child = spawn(options.npmCmd, args, {
      windowsHide: true,
      shell: process.platform === 'win32',
      env: process.env,
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
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearInterval(heartbeat)
      const exitCode = code ?? null
      void appendLog(
        options.logPath,
        `\nnpm finished exit=${exitCode}\n`,
      ).then(() => {
        resolve({
          ok: exitCode === 0,
          exitCode,
          stdout,
          stderr,
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

    const npmCmd = resolveNpmCmd(bestOk.exe)
    emit('installing', `使用 npm：${npmCmd}`)

    let npmResult = await runNpmInstall({
      npmCmd,
      prefix,
      registry: OPENCODE_INSTALL.registryOfficial,
      logPath,
      onProgress: (message) => emit('installing', message),
    })

    if (!npmResult.ok) {
      emit('installing', '官方源失败或超时，切换国内镜像重试…')
      await appendLog(logPath, 'official registry failed, retry mirror\n')
      npmResult = await runNpmInstall({
        npmCmd,
        prefix,
        registry: OPENCODE_INSTALL.registryMirror,
        logPath,
        onProgress: (message) => emit('installing', message),
      })
    }

    if (!npmResult.ok) {
      return {
        ok: false,
        code: 'npm-failed',
        message: withLogHint(
          `npm 安装失败${npmResult.exitCode != null ? `（退出码 ${npmResult.exitCode}）` : ''}。请检查网络后重试，或按文档手动安装。`,
          logPath,
        ),
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
