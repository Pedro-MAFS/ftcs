import { execFile } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { downloadNodeMsi, verifyMsiSha256 } from './msi-download'
import {
  NODE_INSTALL,
  type NodeInstallProgress,
  type NodeInstallResult,
} from './node-install-types'
import { findAcceptableInstalledNode, resolveBestNode } from './resolve-node'
import { installNodeWithWinget, resolveWingetPath } from './winget-node'

const execFileAsync = promisify(execFile)

let installing = false

function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

async function appendLog(logPath: string, chunk: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
  await fs.promises.appendFile(logPath, chunk, 'utf8')
}

function restartMessage(method: string): string {
  return `Node.js ${NODE_INSTALL.version} 已通过 ${method} 安装成功。请完全退出本应用后重新打开，再点「重新检测」。`
}

async function verifyNodeInstalled(
  logPath: string,
): Promise<{ ok: true; exe: string; version: string } | { ok: false; detail: string }> {
  await new Promise((r) => setTimeout(r, 1500))
  const resolved = await findAcceptableInstalledNode()
  if (!resolved) {
    await appendLog(logPath, 'verify: no acceptable node (>=22) found\n')
    return {
      ok: false,
      detail:
        '安装后仍未找到可用的 Node.js ≥22（已检查注册表 InstallPath、常见目录与 PATH）。可能未弹出权限确认或安装未真正执行。',
    }
  }
  await appendLog(
    logPath,
    `verify: found ${resolved.exe} version=${resolved.version} source=${resolved.source}\n`,
  )
  return { ok: true, exe: resolved.exe, version: resolved.version }
}

async function runElevatedMsiexec(
  msiPath: string,
  logPath: string,
): Promise<{
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  elevationDenied?: boolean
}> {
  const workDir = path.join(app.getPath('temp'), 'ftcs-node-install')
  await fs.promises.mkdir(workDir, { recursive: true })
  const resultFile = path.join(workDir, `msiexec-result-${Date.now()}.txt`)
  const msiLog = path.join(workDir, `msiexec-${Date.now()}.log`)

  // 把脚本落到文件再执行，避免引号转义问题；并显式处理 UAC 取消 / $p 为 null
  const scriptPath = path.join(workDir, `install-node-${Date.now()}.ps1`)
  const script = `
$ErrorActionPreference = 'Stop'
$msi = '${msiPath.replace(/'/g, "''")}'
$resultFile = '${resultFile.replace(/'/g, "''")}'
$msiLog = '${msiLog.replace(/'/g, "''")}'
try {
  $p = Start-Process -FilePath "$env:SystemRoot\\System32\\msiexec.exe" -ArgumentList @(
    '/i', $msi, '/qn', '/norestart', '/L*v', $msiLog
  ) -Wait -PassThru -Verb RunAs
  if ($null -eq $p) {
    Set-Content -LiteralPath $resultFile -Value 'status=null-process' -Encoding utf8
    exit 1223
  }
  $code = $p.ExitCode
  if ($null -eq $code) {
    Set-Content -LiteralPath $resultFile -Value 'status=null-exitcode' -Encoding utf8
    exit 1
  }
  Set-Content -LiteralPath $resultFile -Value ("status=ok;exit=" + $code) -Encoding utf8
  exit $code
} catch {
  $msg = $_.Exception.Message
  Set-Content -LiteralPath $resultFile -Value ("status=error;" + $msg) -Encoding utf8
  if ($msg -match 'canceled|cancelled|取消|denied|拒绝') { exit 1223 }
  exit 1
}
`.trim()

  await fs.promises.writeFile(scriptPath, script, 'utf8')
  await appendLog(logPath, `msiexec script: ${scriptPath}\nmsi: ${msiPath}\n`)

  let stdout = ''
  let stderr = ''
  let exitCode: number | null = null

  try {
    const result = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      {
        // 隐藏父进程可能导致部分环境下 UAC 无法关联前台；提升窗口需可见机会
        windowsHide: false,
        timeout: NODE_INSTALL.installTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      },
    )
    stdout = result.stdout || ''
    stderr = result.stderr || ''
    exitCode = 0
  } catch (err) {
    const e = err as {
      status?: number
      stdout?: string
      stderr?: string
      message?: string
    }
    stdout = String(e.stdout || '')
    stderr = String(e.stderr || e.message || '')
    exitCode = typeof e.status === 'number' ? e.status : null
  }

  let resultText = ''
  try {
    resultText = await fs.promises.readFile(resultFile, 'utf8')
  } catch {
    resultText = ''
  }
  await appendLog(
    logPath,
    `msiexec wrapper exit=${exitCode}\nresultFile=${resultText}\nstdout:\n${stdout}\nstderr:\n${stderr}\nmsiLog=${msiLog}\n`,
  )

  const elevationDenied =
    exitCode === 1223 ||
    /null-process|canceled|cancelled|取消|1223/i.test(resultText) ||
    /canceled by the user|cancelled by the user|操作已取消|被用户取消/i.test(
      `${stdout}\n${stderr}\n${resultText}`,
    )

  // msiexec：0 成功；3010 成功但建议重启
  const ok = exitCode === 0 || exitCode === 3010
  return {
    ok,
    exitCode,
    stdout: `${stdout}\n${resultText}`.trim(),
    stderr,
    elevationDenied: elevationDenied && !ok,
  }
}

export async function installNodeRuntime(options?: {
  onProgress?: (p: NodeInstallProgress) => void
}): Promise<NodeInstallResult> {
  const emit = (phase: NodeInstallProgress['phase'], message: string) => {
    options?.onProgress?.({ phase, message })
  }

  if (process.platform !== 'win32') {
    return {
      ok: false,
      code: 'unsupported-platform',
      message: '一键安装目前仅支持 Windows。请从 Node 官网手动安装。',
      manualUrl: NODE_INSTALL.manualUrl,
    }
  }

  if (installing) {
    return {
      ok: false,
      code: 'busy',
      message: '正在安装 Node.js，请稍候。',
      manualUrl: NODE_INSTALL.manualUrl,
    }
  }

  installing = true
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logsDir(), `node-install-${stamp}.log`)

  try {
    emit('checking', '正在检查安装方式…')
    await appendLog(
      logPath,
      `[${new Date().toISOString()}] start install Node ${NODE_INSTALL.version}\n`,
    )

    const before = await resolveBestNode()
    await appendLog(
      logPath,
      `before: ok=${before.bestOk?.exe ?? 'none'} (${before.bestOk?.version ?? '-'}) any=${before.bestAny?.exe ?? 'none'} (${before.bestAny?.version ?? '-'})\n`,
    )

    const winget = await resolveWingetPath()
    if (winget) {
      emit('winget', '正在通过 winget 安装 Node.js（可能弹出权限确认）…')
      await appendLog(logPath, `winget: ${winget}\n`)
      const wingetResult = await installNodeWithWinget(winget)
      await appendLog(
        logPath,
        `winget exit=${wingetResult.exitCode}\nstdout:\n${wingetResult.stdout}\nstderr:\n${wingetResult.stderr}\n`,
      )

      if (wingetResult.ok) {
        emit('checking', '正在确认 Node.js 是否已安装到本机…')
        const verified = await verifyNodeInstalled(logPath)
        if (verified.ok) {
          emit('done', restartMessage('winget'))
          return {
            ok: true,
            version: verified.version.replace(/^v/, ''),
            method: 'winget',
            message: restartMessage('winget'),
            needsRestart: true,
            logPath,
          }
        }
        await appendLog(
          logPath,
          `winget reported ok but verify failed: ${verified.detail}\nfalling back to MSI\n`,
        )
      } else if (wingetResult.elevationDenied) {
        return {
          ok: false,
          code: 'elevation-denied',
          message:
            '安装需要管理员权限，但权限请求被拒绝或取消。请允许 UAC 后重试，或打开官网手动安装。',
          logPath,
          manualUrl: NODE_INSTALL.manualUrl,
        }
      } else {
        await appendLog(logPath, 'winget failed, falling back to MSI\n')
      }
    } else {
      await appendLog(logPath, 'winget not found, using MSI\n')
    }

    emit('downloading', '正在下载 Node.js 官方安装包…')
    const msiPath = path.join(
      app.getPath('temp'),
      'ftcs-node-install',
      NODE_INSTALL.msiFileName,
    )
    await downloadNodeMsi(msiPath, (downloaded, total) => {
      if (!total) {
        emit('downloading', `正在下载… ${(downloaded / 1024 / 1024).toFixed(1)} MB`)
        return
      }
      const pct = Math.min(99, Math.round((downloaded / total) * 100))
      emit('downloading', `正在下载安装包… ${pct}%`)
    })

    emit('checking', '正在校验安装包…')
    const checksumOk = await verifyMsiSha256(msiPath)
    if (!checksumOk) {
      await appendLog(logPath, 'checksum mismatch\n')
      return {
        ok: false,
        code: 'checksum-failed',
        message: '安装包校验失败，请检查网络后重试，或打开官网手动下载。',
        logPath,
        manualUrl: NODE_INSTALL.manualUrl,
      }
    }

    emit('installing', '正在安装 Node.js（请留意屏幕上的权限确认窗口）…')
    const msiResult = await runElevatedMsiexec(msiPath, logPath)

    if (msiResult.elevationDenied) {
      return {
        ok: false,
        code: 'elevation-denied',
        message:
          '未获得管理员权限（可能未弹出或取消了 UAC）。请重试并在权限窗口点「是」，或打开官网手动安装。',
        logPath,
        manualUrl: NODE_INSTALL.manualUrl,
      }
    }

    if (!msiResult.ok) {
      return {
        ok: false,
        code: 'msiexec-failed',
        message: `MSI 安装失败${msiResult.exitCode != null ? `（退出码 ${msiResult.exitCode}）` : ''}。请查看日志或打开官网手动安装。`,
        logPath,
        manualUrl: NODE_INSTALL.manualUrl,
      }
    }

    emit('checking', '正在确认 Node.js 是否已安装到本机…')
    const verified = await verifyNodeInstalled(logPath)
    if (!verified.ok) {
      return {
        ok: false,
        code: 'msiexec-failed',
        message: `${verified.detail} 请重试；若仍无权限窗口，请打开官网手动安装。`,
        logPath,
        manualUrl: NODE_INSTALL.manualUrl,
      }
    }

    emit('done', restartMessage('MSI'))
    return {
      ok: true,
      version: verified.version.replace(/^v/, ''),
      method: 'msi',
      message: restartMessage('MSI'),
      needsRestart: true,
      logPath,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await appendLog(logPath, `error: ${message}\n`).catch(() => undefined)
    const code =
      message.includes('下载') || message.includes('HTTP')
        ? 'download-failed'
        : 'unknown'
    emit('failed', message)
    return {
      ok: false,
      code,
      message: `安装失败：${message}`,
      logPath,
      manualUrl: NODE_INSTALL.manualUrl,
    }
  } finally {
    installing = false
  }
}
