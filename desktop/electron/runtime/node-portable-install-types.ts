import { getDocsInstallUrl } from '../config/site-origins'

/** Node.js 私有运行时一键准备（见 docs/design/US-R-01） */
export const NODE_PORTABLE_INSTALL = {
  version: '24.18.0',
  minMajorForOk: 22,
  prefixDirName: 'node-runtime',
  zipAssetName: 'node-v24.18.0-win-x64.zip',
  zipInnerDirName: 'node-v24.18.0-win-x64',
  nodeExeName: 'node.exe',
  markerFileName: '.ftcs-node-portable',
  sha256Zip:
    '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821',
  expectedZipBytes: 37_176_245,
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/nodev24.18.0/node-v24.18.0-win-x64.zip',
  urlOfficial:
    'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-x64.zip',
  urlMirror:
    'https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-win-x64.zip',
  downloadTimeoutMs: 180_000,
  installTimeoutMs: 15 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
} as const

/** @deprecated 保留 minMajor/version 供 resolve-node 等引用 */
export const NODE_INSTALL = {
  version: NODE_PORTABLE_INSTALL.version,
  minMajorForOk: NODE_PORTABLE_INSTALL.minMajorForOk,
  manualUrl: NODE_PORTABLE_INSTALL.manualDocsUrl,
  installTimeoutMs: NODE_PORTABLE_INSTALL.installTimeoutMs,
} as const

export type NodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type NodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface NodeInstallProgress {
  phase: NodeInstallProgressPhase
  message: string
}

export type NodeInstallResult =
  | {
      ok: true
      version: string
      method: NodeInstallMethod
      message: string
      needsRestart: false
      binaryPath: string
      logPath?: string
    }
  | {
      ok: false
      code: NodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }
