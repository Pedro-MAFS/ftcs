import { execFile } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { writeUserPrefs } from '../config/user-prefs'
import {
  downloadOfficeCliBinary,
  verifyOfficeCliSha256,
} from './officecli-download'
import {
  OFFICECLI_INSTALL,
  type OfficeCliInstallProgress,
  type OfficeCliInstallResult,
} from './officecli-install-types'
import {
  getOfficeCliRuntimeBinaryPath,
  getOfficeCliRuntimeDir,
  isOfficeCliInstallSupported,
} from './officecli-paths'

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

function sourceLabel(url: string): string {
  if (url.includes('gitee.com')) return 'Gitee 镜像'
  if (url.includes('github.com')) return 'GitHub'
  return url
}

async function runVersion(exe: string): Promise<string> {
  const { stdout } = await execFileAsync(exe, ['--version'], {
    windowsHide: true,
    timeout: 30_000,
  })
  return (stdout.trim().split(/\r?\n/)[0] ?? '').trim()
}

export async function installOfficeCliRuntime(options?: {
  onProgress?: (progress: OfficeCliInstallProgress) => void
}): Promise<OfficeCliInstallResult> {
  const emit = (
    phase: OfficeCliInstallProgress['phase'],
    message: string,
  ) => {
    options?.onProgress?.({ phase, message })
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logsDir(), `officecli-install-${stamp}.log`)
  const manualUrl = OFFICECLI_INSTALL.manualDocsUrl

  if (installing) {
    return {
      ok: false,
      code: 'busy',
      message: 'OfficeCLI 正在安装中，请稍候',
      manualUrl,
    }
  }

  if (!isOfficeCliInstallSupported()) {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '当前仅支持 Windows 64 位一键安装 OfficeCLI',
      manualUrl,
    }
  }

  installing = true
  emit('checking', '正在准备安装 OfficeCLI…')

  const tmpDir = path.join(app.getPath('userData'), 'tmp')
  const tmpFile = path.join(tmpDir, `officecli-download-${Date.now()}.exe`)
  const destExe = getOfficeCliRuntimeBinaryPath()
  const destDir = getOfficeCliRuntimeDir()
  const destTmp = `${destExe}.tmp`

  try {
    await fs.promises.mkdir(tmpDir, { recursive: true })
    await appendLog(
      logPath,
      `[start] version=${OFFICECLI_INSTALL.version} dest=${destExe}\n`,
    )

    emit('downloading', '正在下载 OfficeCLI…')
    let usedUrl = ''
    try {
      const { url } = await downloadOfficeCliBinary(
        tmpFile,
        (downloaded, total, url) => {
          usedUrl = url
          if (total && total > 0) {
            const pct = Math.min(99, Math.round((downloaded / total) * 100))
            emit(
              'downloading',
              `正在从${sourceLabel(url)}下载… ${pct}%`,
            )
          } else {
            emit(
              'downloading',
              `正在从${sourceLabel(url)}下载… ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
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

    emit('verifying', '正在校验文件…')
    const shaOk = await verifyOfficeCliSha256(tmpFile)
    if (!shaOk) {
      await fs.promises.unlink(tmpFile).catch(() => undefined)
      await appendLog(logPath, `[checksum] mismatch from ${usedUrl}\n`)
      emit('failed', '校验失败')
      return {
        ok: false,
        code: 'checksum',
        message: withLogHint(
          '下载文件校验失败（SHA256 不符），未写入安装目录。请重试或按说明手动下载。',
          logPath,
        ),
        logPath,
        manualUrl,
      }
    }
    await appendLog(logPath, `[checksum] ok\n`)

    emit('installing', '正在写入应用目录…')
    try {
      await fs.promises.mkdir(destDir, { recursive: true })
      await fs.promises.copyFile(tmpFile, destTmp)
      await fs.promises.rename(destTmp, destExe)
      await fs.promises.unlink(tmpFile).catch(() => undefined)
      writeUserPrefs({ officecliPath: destExe })
      await appendLog(logPath, `[write] prefs.officecliPath=${destExe}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await fs.promises.unlink(destTmp).catch(() => undefined)
      await fs.promises.unlink(tmpFile).catch(() => undefined)
      await appendLog(logPath, `[write] failed: ${msg}\n`)
      emit('failed', '写入失败')
      return {
        ok: false,
        code: 'write-failed',
        message: withLogHint(`写入安装目录失败：${msg}`, logPath),
        logPath,
        manualUrl,
      }
    }

    emit('verifying', '正在验证可执行文件…')
    let versionOut = ''
    try {
      versionOut = await runVersion(destExe)
      await appendLog(logPath, `[verify] ${versionOut || '(empty)'}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await appendLog(logPath, `[verify] failed: ${msg}\n`)
      emit('failed', '验证失败')
      return {
        ok: false,
        code: 'verify-failed',
        message: withLogHint(
          `文件已写入但无法运行（可能被杀软隔离）：${msg}`,
          logPath,
        ),
        logPath,
        manualUrl,
      }
    }

    const message = `OfficeCLI ${OFFICECLI_INSTALL.version} 已安装到本应用目录，可立即使用（生成 Word/Excel/PPT 资料时需要）。`
    emit('done', message)
    await appendLog(logPath, `[done] ${message}\n`)

    return {
      ok: true,
      version: versionOut || OFFICECLI_INSTALL.version,
      method: 'download',
      binaryPath: destExe,
      message,
      needsRestart: false,
      logPath,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendLog(logPath, `[unknown] ${msg}\n`).catch(() => undefined)
    emit('failed', '安装失败')
    return {
      ok: false,
      code: 'unknown',
      message: withLogHint(`安装失败：${msg}`, logPath),
      logPath,
      manualUrl,
    }
  } finally {
    installing = false
  }
}
