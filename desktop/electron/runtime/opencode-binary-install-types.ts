import { getDocsInstallUrl } from '../config/site-origins'

/** OpenCode CLI 二进制直装（见 docs/design/US-R-02） */
export const OPENCODE_BINARY_INSTALL = {
  version: '1.18.4',
  prefixDirName: 'opencode-runtime',
  binaryFileName: 'opencode.exe',
  zipAssetName: 'opencode-windows-x64.zip',
  zipEntryExe: 'opencode.exe',
  markerFileName: '.ftcs-opencode-portable',
  sha256Zip:
    '814dae5724dfa396a43b6408703d0929625483e2fac135623f10f0fa8db04a96',
  expectedZipBytes: 59_388_435,
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/opencodev1.18.4/opencode-windows-x64.zip',
  urlGitHub:
    'https://github.com/anomalyco/opencode/releases/download/v1.18.4/opencode-windows-x64.zip',
  downloadTimeoutMs: 180_000,
  installTimeoutMs: 15 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
} as const

/** @deprecated 保留 version / prefix 供旧引用 */
export const OPENCODE_INSTALL = {
  version: OPENCODE_BINARY_INSTALL.version,
  prefixDirName: OPENCODE_BINARY_INSTALL.prefixDirName,
  manualDocsUrl: OPENCODE_BINARY_INSTALL.manualDocsUrl,
  installTimeoutMs: OPENCODE_BINARY_INSTALL.installTimeoutMs,
} as const

export type OpenCodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type OpenCodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type OpenCodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OpenCodeInstallProgress {
  phase: OpenCodeInstallProgressPhase
  message: string
}

export type OpenCodeInstallResult =
  | {
      ok: true
      version: string
      method: OpenCodeInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OpenCodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }
