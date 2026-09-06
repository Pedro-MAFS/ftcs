import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { readUserPrefs } from '../config/user-prefs'
import { isNodePathUnderRuntimeDir } from './node-path-utils'
import { NODE_PORTABLE_INSTALL } from './node-portable-install-types'

/** userData/node-runtime */
export function getNodeRuntimeDir(): string {
  return path.join(app.getPath('userData'), NODE_PORTABLE_INSTALL.prefixDirName)
}

export function getNodeRuntimeBinaryPath(): string {
  return path.join(getNodeRuntimeDir(), NODE_PORTABLE_INSTALL.nodeExeName)
}

export function getNodePortableMarkerPath(): string {
  return path.join(getNodeRuntimeDir(), NODE_PORTABLE_INSTALL.markerFileName)
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

export function isNodePortableBound(): boolean {
  try {
    const runtimeDir = getNodeRuntimeDir()
    const prefs = readUserPrefs()
    if (prefs.nodePath && isNodePathUnderRuntimeDir(prefs.nodePath, runtimeDir)) {
      return true
    }
    return (
      fs.existsSync(getNodePortableMarkerPath()) &&
      isExistingFile(getNodeRuntimeBinaryPath())
    )
  } catch {
    return false
  }
}

/**
 * 私有 Node 解析链：FTCS_NODE_PATH → prefs.nodePath → userData/node-runtime。
 * 不扫系统 PATH / 注册表。
 */
export function resolveConfiguredNode(): {
  exe: string
  source: string
} | null {
  if (process.env.FTCS_NODE_PATH) {
    const p = path.resolve(process.env.FTCS_NODE_PATH)
    if (isExistingFile(p)) {
      return { exe: p, source: 'FTCS_NODE_PATH' }
    }
  }

  const prefs = readUserPrefs()
  if (prefs.nodePath) {
    const p = path.resolve(prefs.nodePath)
    if (isExistingFile(p)) {
      return { exe: p, source: 'prefs.nodePath' }
    }
  }

  try {
    const fromRuntime = getNodeRuntimeBinaryPath()
    if (isExistingFile(fromRuntime)) {
      return { exe: fromRuntime, source: 'userData/node-runtime' }
    }
  } catch {
    // app 未 ready
  }

  return null
}

export function isNodePortableInstallSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64'
}
