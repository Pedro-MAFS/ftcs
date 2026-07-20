import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { OPENCODE_INSTALL } from './opencode-install-types'
import { readUserPrefs } from '../config/user-prefs'

/** userData/opencode-runtime */
export function getOpenCodeRuntimePrefix(): string {
  return path.join(app.getPath('userData'), OPENCODE_INSTALL.prefixDirName)
}

/**
 * 从 npm --prefix 安装树解析 opencode 可执行文件。
 */
export function resolveOpenCodeBinFromPrefix(prefixRoot: string): string | null {
  const pkgDir = path.join(prefixRoot, 'node_modules', OPENCODE_INSTALL.packageName)
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
        bin?: string | Record<string, string>
      }
      const binField = pkg.bin
      let rel: string | undefined
      if (typeof binField === 'string') rel = binField
      else if (binField && typeof binField === 'object') {
        rel = binField.opencode ?? Object.values(binField)[0]
      }
      if (rel) {
        const abs = path.resolve(pkgDir, rel)
        if (fs.existsSync(abs)) return abs
      }
    } catch {
      // fall through
    }
  }

  const binDir = path.join(prefixRoot, 'node_modules', '.bin')
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(pkgDir, 'bin', 'opencode.exe'),
          path.join(binDir, 'opencode.exe'),
          path.join(binDir, 'opencode.cmd'),
          path.join(binDir, 'opencode'),
        ]
      : [
          path.join(pkgDir, 'bin', 'opencode'),
          path.join(binDir, 'opencode'),
        ]

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

/** 偏好 / 环境变量 / 本地前缀 中已配置的路径（文件存在才返回） */
export function resolveConfiguredOpenCodeBin(): {
  exe: string
  source: string
} | null {
  const prefs = readUserPrefs()
  if (prefs.opencodePath) {
    const p = path.resolve(prefs.opencodePath)
    if (fs.existsSync(p)) return { exe: p, source: 'prefs.opencodePath' }
  }

  if (process.env.FTCS_OPENCODE_PATH) {
    const p = path.resolve(process.env.FTCS_OPENCODE_PATH)
    if (fs.existsSync(p)) return { exe: p, source: 'FTCS_OPENCODE_PATH' }
  }

  try {
    const fromPrefix = resolveOpenCodeBinFromPrefix(getOpenCodeRuntimePrefix())
    if (fromPrefix) {
      return { exe: fromPrefix, source: 'userData/opencode-runtime' }
    }
  } catch {
    // app 未 ready 时 getPath 可能抛；探测阶段应已 ready
  }

  return null
}
