import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { readUserPrefs } from '../config/user-prefs'
import { OPENCODE_BINARY_INSTALL } from './opencode-binary-install-types'
import { isOpenCodePathUnderRuntimeDir } from './opencode-path-utils'

/** userData/opencode-runtime */
export function getOpenCodeRuntimeDir(): string {
  return path.join(app.getPath('userData'), OPENCODE_BINARY_INSTALL.prefixDirName)
}

export function getOpenCodeRuntimeBinaryPath(): string {
  return path.join(getOpenCodeRuntimeDir(), OPENCODE_BINARY_INSTALL.binaryFileName)
}

export function getOpenCodePortableMarkerPath(): string {
  return path.join(
    getOpenCodeRuntimeDir(),
    OPENCODE_BINARY_INSTALL.markerFileName,
  )
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

export function isOpenCodePortableBound(): boolean {
  try {
    const runtimeDir = getOpenCodeRuntimeDir()
    const prefs = readUserPrefs()
    if (
      prefs.opencodePath &&
      isOpenCodePathUnderRuntimeDir(prefs.opencodePath, runtimeDir)
    ) {
      return true
    }
    return (
      fs.existsSync(getOpenCodePortableMarkerPath()) &&
      isExistingFile(getOpenCodeRuntimeBinaryPath())
    )
  } catch {
    return false
  }
}

/**
 * 私有 OpenCode 解析链：FTCS_OPENCODE_PATH → prefs → userData flat exe。
 * 不扫 npm node_modules 树。
 */
export function resolveConfiguredOpenCodeBin(): {
  exe: string
  source: string
} | null {
  if (process.env.FTCS_OPENCODE_PATH) {
    const p = path.resolve(process.env.FTCS_OPENCODE_PATH)
    if (isExistingFile(p)) {
      return { exe: p, source: 'FTCS_OPENCODE_PATH' }
    }
  }

  const prefs = readUserPrefs()
  if (prefs.opencodePath) {
    const p = path.resolve(prefs.opencodePath)
    if (isExistingFile(p)) {
      return { exe: p, source: 'prefs.opencodePath' }
    }
  }

  try {
    const fromRuntime = getOpenCodeRuntimeBinaryPath()
    if (isExistingFile(fromRuntime)) {
      return { exe: fromRuntime, source: 'userData/opencode-runtime' }
    }
  } catch {
    // app 未 ready
  }

  return null
}

export function isOpenCodeBinaryInstallSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64'
}

/** @deprecated 不再解析 npm 前缀树 */
export function getOpenCodeRuntimePrefix(): string {
  return getOpenCodeRuntimeDir()
}
