import { getDocsInstallUrl } from '../config/site-origins'

/** OpenCode CLI 一键安装常量（见 docs/10） */
export const OPENCODE_INSTALL = {
  packageName: 'opencode-ai' as const,
  version: '1.18.4' as const,
  prefixDirName: 'opencode-runtime' as const,
  registryOfficial: 'https://registry.npmjs.org' as const,
  registryMirror: 'https://registry.npmmirror.com' as const,
  installTimeoutMs: 15 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
}

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
