import { execFile } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { writeUserPrefs } from '../config/user-prefs'
import {
  downloadOpenCodeBinaryZip,
  opencodeBinaryDownloadSourceLabel,
  verifyOpenCodeBinaryZipSha256,
} from './opencode-binary-download'
import { installOpenCodeBinaryFromZip } from './opencode-binary-extract'
import {
  getOpenCodeRuntimeBinaryPath,
  isOpenCodeBinaryInstallSupported,
  isOpenCodePortableBound,
  resolveConfiguredOpenCodeBin,
} from './opencode-paths'
import {
  OPENCODE_BINARY_INSTALL,
  type OpenCodeInstallProgress,
  type OpenCodeInstallResult,
} from './opencode-binary-install-types'

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

async function readOpenCodeVersion(exe: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(exe, ['--version'], {
      windowsHide: true,
      timeout: 30_000,
    })
    return (stdout.trim().split(/\r?\n/)[0] ?? '').trim() || null
  } catch {
    return null
  }
}

async function verifyOpenCodeBinary(
  exe: string,
  logPath: string,
): Promise<{ ok: true; version: string } | { ok: false; detail: string }> {
  const version =
    (await readOpenCodeVersion(exe)) ?? OPENCODE_BINARY_INSTALL.version
  if (!version) {
    await appendLog(logPath, `verify: --version failed for ${exe}\n`)
    return { ok: false, detail: '无法读取 OpenCode 版本（--version 失败）' }
  }
  await appendLog(logPath, `verify: ok ${version} at ${exe}\n`)
  return { ok: true, version }
}

export async function installOpenCodeBinaryRuntime(options?: {
  forceReinstall?: boolean
  onProgress?: (progress: OpenCodeInstallProgress) => void
}): Promise<OpenCodeInstallResult> {
  const emit = (phase: OpenCodeInstallProgress['phase'], message: string) => {
    options?.onProgress?.({ phase, message })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logsDir(), `opencode-install-${stamp}.log`)
  const manualUrl = OPENCODE_BINARY_INSTALL.manualDocsUrl

  if (installing) {
    return {
      ok: false,
      code: 'busy',
      message: 'OpenCode 正在准备中，请稍候',
      manualUrl,
    }
  }

  if (!isOpenCodeBinaryInstallSupported()) {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '当前仅支持 Windows 64 位一键准备 OpenCode CLI',
      manualUrl,
    }
  }

  installing = true
  emit('checking', '正在检查 OpenCode CLI…')

  const tmpRoot = path.join(app.getPath('temp'), 'ftcs-opencode-binary')
  const zipPath = path.join(tmpRoot, `opencode-download-${Date.now()}.zip`)
  const stagingDir = path.join(tmpRoot, `extract-${Date.now()}`)
  const destExe = getOpenCodeRuntimeBinaryPath()
  const wasBound = isOpenCodePortableBound()

  try {
    await fs.promises.mkdir(tmpRoot, { recursive: true })
    await appendLog(
      logPath,
      `[start] version=${OPENCODE_BINARY_INSTALL.version} dest=${destExe} force=${Boolean(options?.forceReinstall)}\n`,
    )

    if (!options?.forceReinstall && isOpenCodePortableBound()) {
      const existing = resolveConfiguredOpenCodeBin()
      if (existing) {
        const verified = await verifyOpenCodeBinary(existing.exe, logPath)
        if (verified.ok) {
          const message = `OpenCode CLI ${verified.version} 已在应用目录中就绪，无需重复下载。`
          emit('done', message)
          return {
            ok: true,
            version: verified.version,
            method: 'already-ok',
            binaryPath: existing.exe,
            message,
            needsRestart: false,
            logPath,
          }
        }
      }
    }

    emit('downloading', '正在下载 OpenCode CLI…')
    let usedUrl = ''
    try {
      const { url } = await downloadOpenCodeBinaryZip(
        zipPath,
        (downloaded, total, url) => {
          usedUrl = url
          if (total && total > 0) {
            const pct = Math.min(99, Math.round((downloaded / total) * 100))
            emit(
              'downloading',
              `正在从${opencodeBinaryDownloadSourceLabel(url)}下载… ${pct}%`,
            )
          } else {
            emit(
              'downloading',
              `正在从${opencodeBinaryDownloadSourceLabel(url)}下载… ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
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
          `下载失败（已试 Gitee 与 GitHub）：${msg}`,
          logPath,
        ),
        logPath,
        manualUrl,
      }
    }

    emit('verifying', '正在校验安装包…')
    const shaOk = await verifyOpenCodeBinaryZipSha256(zipPath)
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

    emit('installing', '正在写入应用目录…')
    try {
      await installOpenCodeBinaryFromZip(zipPath, stagingDir, destExe)
      await appendLog(logPath, `[extract] ok dest=${destExe}\n`)
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
      writeUserPrefs({ opencodePath: destExe })
      await appendLog(logPath, `[write] prefs.opencodePath=${destExe}\n`)
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

    emit('verifying', '正在验证 OpenCode CLI…')
    const verified = await verifyOpenCodeBinary(destExe, logPath)
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

    const message = `OpenCode CLI ${OPENCODE_BINARY_INSTALL.version} 已准备到本应用目录，可立即使用。`
    emit('done', message)
    await appendLog(logPath, `[done] ${message}\n`)

    return {
      ok: true,
      version: verified.version,
      method: wasBound || options?.forceReinstall ? 'reinstall' : 'portable',
      binaryPath: destExe,
      message,
      needsRestart: false,
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

export const installOpenCodeRuntime = installOpenCodeBinaryRuntime
