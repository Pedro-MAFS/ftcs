import { execFile } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { writeUserPrefs } from '../config/user-prefs'
import {
  downloadNodePortableZip,
  nodePortableDownloadSourceLabel,
  verifyNodePortableZipSha256,
} from './node-portable-download'
import { installNodePortableFromZip } from './node-portable-extract'
import {
  getNodeRuntimeBinaryPath,
  getNodeRuntimeDir,
  isNodePortableBound,
  isNodePortableInstallSupported,
  resolveConfiguredNode,
} from './node-paths'
import {
  NODE_PORTABLE_INSTALL,
  type NodeInstallProgress,
  type NodeInstallResult,
} from './node-portable-install-types'

const execFileAsync = promisify(execFile)

let installing = false

function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

async function appendLog(logPath: string, chunk: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
  await fs.promises.appendFile(logPath, chunk, 'utf8')
}

function withLogHint(message: string, logPath: string): string {
  return `${message}（日志：${logPath}）`
}

function parseNodeMajor(versionRaw: string): number | null {
  const m = versionRaw.trim().match(/^v?(\d+)\./)
  if (!m) return null
  const major = Number.parseInt(m[1] ?? '', 10)
  return Number.isFinite(major) ? major : null
}

async function readNodeVersion(nodeExe: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(nodeExe, ['-v'], {
      windowsHide: true,
      timeout: 30_000,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function verifyPortableNode(
  nodeExe: string,
  logPath: string,
): Promise<
  { ok: true; version: string } | { ok: false; detail: string }
> {
  const version = await readNodeVersion(nodeExe)
  if (!version) {
    await appendLog(logPath, `verify: node -v failed for ${nodeExe}\n`)
    return { ok: false, detail: '无法读取 Node 版本（node -v 失败）' }
  }
  const major = parseNodeMajor(version)
  if (major == null || major < NODE_PORTABLE_INSTALL.minMajorForOk) {
    await appendLog(
      logPath,
      `verify: version ${version} major=${major ?? '?'}\n`,
    )
    return {
      ok: false,
      detail: `Node 版本 ${version} 不满足 ≥ ${NODE_PORTABLE_INSTALL.minMajorForOk}`,
    }
  }
  await appendLog(logPath, `verify: ok ${version} at ${nodeExe}\n`)
  return { ok: true, version }
}

export async function installNodePortableRuntime(options?: {
  forceReinstall?: boolean
  onProgress?: (progress: NodeInstallProgress) => void
}): Promise<NodeInstallResult> {
  const emit = (phase: NodeInstallProgress['phase'], message: string) => {
    options?.onProgress?.({ phase, message })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logsDir(), `node-install-${stamp}.log`)
  const manualUrl = NODE_PORTABLE_INSTALL.manualDocsUrl

  if (installing) {
    return {
      ok: false,
      code: 'busy',
      message: 'Node.js 正在准备中，请稍候',
      manualUrl,
    }
  }

  if (!isNodePortableInstallSupported()) {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '当前仅支持 Windows 64 位一键准备 Node.js',
      manualUrl,
    }
  }

  installing = true
  emit('checking', '正在检查 Node.js 运行时…')

  const tmpRoot = path.join(app.getPath('temp'), 'ftcs-node-portable')
  const zipPath = path.join(tmpRoot, `node-download-${Date.now()}.zip`)
  const stagingDir = path.join(tmpRoot, `extract-${Date.now()}`)
  const targetDir = getNodeRuntimeDir()
  const destExe = getNodeRuntimeBinaryPath()
  const wasBound = resolveConfiguredNode() != null

  try {
    await fs.promises.mkdir(tmpRoot, { recursive: true })
    await appendLog(
      logPath,
      `[start] version=${NODE_PORTABLE_INSTALL.version} dest=${destExe} force=${Boolean(options?.forceReinstall)}\n`,
    )

    if (!options?.forceReinstall && isNodePortableBound()) {
      const existing = resolveConfiguredNode()
      if (existing) {
        const verified = await verifyPortableNode(existing.exe, logPath)
        if (verified.ok) {
          const message = `Node.js ${verified.version.replace(/^v/, '')} 已在应用目录中就绪，无需重复下载。`
          emit('done', message)
          return {
            ok: true,
            version: verified.version.replace(/^v/, ''),
            method: 'already-ok',
            message,
            needsRestart: false,
            binaryPath: existing.exe,
            logPath,
          }
        }
      }
    }

    emit('downloading', '正在下载 Node.js…')
    let usedUrl = ''
    try {
      const { url } = await downloadNodePortableZip(
        zipPath,
        (downloaded, total, url) => {
          usedUrl = url
          if (total && total > 0) {
            const pct = Math.min(99, Math.round((downloaded / total) * 100))
            emit(
              'downloading',
              `正在从${nodePortableDownloadSourceLabel(url)}下载… ${pct}%`,
            )
          } else {
            emit(
              'downloading',
              `正在从${nodePortableDownloadSourceLabel(url)}下载… ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
            )
          }
        },
      )
      usedUrl = url
      await appendLog(logPath, `[download] ok from ${url}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendLog(logPath, `[download] failed: ${msg}\n`)
      emit('failed', '下载失败')
      return {
        ok: false,
        code: 'network',
        message: withLogHint(
          `下载失败（已试 Gitee、Node 官方与 npmmirror）：${msg}`,
          logPath,
        ),
        logPath,
        manualUrl,
      }
    }

    emit('verifying', '正在校验安装包…')
    const shaOk = await verifyNodePortableZipSha256(zipPath)
    if (!shaOk) {
      await fs.promises.unlink(zipPath).catch(() => undefined)
      await appendLog(logPath, `[checksum] mismatch from ${usedUrl}\n`)
      emit('failed', '校验失败')
      return {
        ok: false,
        code: 'checksum',
        message: withLogHint(
          '下载文件校验失败（SHA256 不符），未写入应用目录。请重试或按说明手动下载同一 zip。',
          logPath,
        ),
        logPath,
        manualUrl,
      }
    }
    await appendLog(logPath, `[checksum] ok\n`)

    emit('installing', '正在解压到应用目录…')
    try {
      await installNodePortableFromZip(zipPath, stagingDir, targetDir)
      await appendLog(logPath, `[extract] ok target=${targetDir}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendLog(logPath, `[extract] failed: ${msg}\n`)
      emit('failed', '解压失败')
      return {
        ok: false,
        code: 'extract-failed',
        message: withLogHint(`解压失败：${msg}`, logPath),
        logPath,
        manualUrl,
      }
    } finally {
      await fs.promises.unlink(zipPath).catch(() => undefined)
      await fs.promises
        .rm(stagingDir, { recursive: true, force: true })
        .catch(() => undefined)
    }

    try {
      writeUserPrefs({ nodePath: destExe })
      await appendLog(logPath, `[write] prefs.nodePath=${destExe}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendLog(logPath, `[write] prefs failed: ${msg}\n`)
      emit('failed', '写入配置失败')
      return {
        ok: false,
        code: 'write-failed',
        message: withLogHint(`写入配置失败：${msg}`, logPath),
        logPath,
        manualUrl,
      }
    }

    emit('verifying', '正在验证 Node.js…')
    const verified = await verifyPortableNode(destExe, logPath)
    if (!verified.ok) {
      emit('failed', '验证失败')
      return {
        ok: false,
        code: 'verify-failed',
        message: withLogHint(verified.detail, logPath),
        logPath,
        manualUrl,
      }
    }

    const version = verified.version.replace(/^v/, '')
    const message = `Node.js ${NODE_PORTABLE_INSTALL.version} 已准备到本应用目录，可立即使用（MCP / npx 将使用此副本）。`
    emit('done', message)
    await appendLog(logPath, `[done] ${message}\n`)

    return {
      ok: true,
      version,
      method: wasBound || options?.forceReinstall ? 'reinstall' : 'portable',
      message,
      needsRestart: false,
      binaryPath: destExe,
      logPath,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendLog(logPath, `[unknown] ${msg}\n`).catch(() => undefined)
    emit('failed', '准备失败')
    return {
      ok: false,
      code: 'unknown',
      message: withLogHint(`准备失败：${msg}`, logPath),
      logPath,
      manualUrl,
    }
  } finally {
    installing = false
  }
}

/** 与 IPC 现名一致 */
export const installNodeRuntime = installNodePortableRuntime
