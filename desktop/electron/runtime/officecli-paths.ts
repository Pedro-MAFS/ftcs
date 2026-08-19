import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { OFFICECLI_INSTALL } from './officecli-install-types'
import { readUserPrefs } from '../config/user-prefs'

/** userData/officecli-runtime */
export function getOfficeCliRuntimeDir(): string {
  return path.join(app.getPath('userData'), OFFICECLI_INSTALL.prefixDirName)
}

export function getOfficeCliRuntimeBinaryPath(): string {
  return path.join(getOfficeCliRuntimeDir(), OFFICECLI_INSTALL.binaryFileName)
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

/**
 * prefs / 环境变量 / 本地目录中已配置的路径（文件存在才返回）。
 * 顺序：FTCS_OFFICECLI_PATH → prefs.officecliPath → userData/officecli-runtime。
 * 不扫 PATH。
 */
export function resolveConfiguredOfficeCli(): {
  exe: string
  source: string
} | null {
  if (process.env.FTCS_OFFICECLI_PATH) {
    const p = path.resolve(process.env.FTCS_OFFICECLI_PATH)
    if (isExistingFile(p)) {
      return { exe: p, source: 'FTCS_OFFICECLI_PATH' }
    }
  }

  const prefs = readUserPrefs()
  if (prefs.officecliPath) {
    const p = path.resolve(prefs.officecliPath)
    if (isExistingFile(p)) {
      return { exe: p, source: 'prefs.officecliPath' }
    }
  }

  try {
    const fromRuntime = getOfficeCliRuntimeBinaryPath()
    if (isExistingFile(fromRuntime)) {
      return { exe: fromRuntime, source: 'userData/officecli-runtime' }
    }
  } catch {
    // app 未 ready 时 getPath 可能抛
  }

  return null
}

export function isOfficeCliInstallSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64'
}
