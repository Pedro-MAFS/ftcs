/** OpenCode CLI 一键安装常量（见 docs/10） */
export const OPENCODE_INSTALL = {
  packageName: 'opencode-ai',
  version: '1.18.4',
  prefixDirName: 'opencode-runtime',
  registryOfficial: 'https://registry.npmjs.org',
  registryMirror: 'https://registry.npmmirror.com',
  manualDocsUrl: 'https://ai-utills.com/ftcs/docs/install',
  installTimeoutMs: 15 * 60 * 1000,
} as const

export type OpenCodeInstallMethod = 'npm-prefix' | 'already-ok'

export type OpenCodeInstallErrorCode =
  | 'unsupported-platform'
  | 'need-node'
  | 'npm-failed'
  | 'verify-failed'
  | 'busy'
  | 'cancelled'
  | 'unknown'

export type OpenCodeInstallProgressPhase =
  | 'checking'
  | 'installing'
  | 'verifying'
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
      needsRestart: true
      logPath?: string
    }
  | {
      ok: false
      code: OpenCodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }
