/** Node.js 一键安装：版本与下载常量（见 docs/09） */
export const NODE_INSTALL = {
  version: '24.18.0',
  minMajorForOk: 22,
  preferredMajor: 24,
  wingetPackageId: 'OpenJS.NodeJS.LTS',
  msiFileName: 'node-v24.18.0-x64.msi',
  msiUrl: 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi',
  msiUrlMirror:
    'https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-x64.msi',
  msiSha256:
    'e30cd4ca15529583afe0efc978f1ae3ab3a93c2400c222d0752d17900552ebb3',
  manualUrl: 'https://nodejs.org/',
  installTimeoutMs: 15 * 60 * 1000,
} as const

export type NodeInstallMethod = 'winget' | 'msi' | 'already-ok'

export type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'already-ok'
  | 'winget-missing'
  | 'winget-failed'
  | 'download-failed'
  | 'checksum-failed'
  | 'msiexec-failed'
  | 'elevation-denied'
  | 'busy'
  | 'cancelled'
  | 'unknown'

export type NodeInstallProgressPhase =
  | 'checking'
  | 'winget'
  | 'downloading'
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
      needsRestart: true
      logPath?: string
    }
  | {
      ok: false
      code: NodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }
