import { getDocsInstallUrl } from '../config/site-origins'

/** OfficeCLI 一键安装常量（见 docs/design/US-I-09） */
export const OFFICECLI_INSTALL = {
  version: '1.0.144',
  prefixDirName: 'officecli-runtime',
  binaryFileName: 'officecli.exe',
  assetWinX64: 'officecli-win-x64.exe',
  sha256WinX64:
    'e780cc6a5385f84b4d54d71b0c179904ed534125ec33fe39b1a8711fa80e387e',
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/office-cli/officecli-win-x64.exe',
  urlGitHub:
    'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.144/officecli-win-x64.exe',
  downloadTimeoutMs: 120_000,
  installTimeoutMs: 10 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
} as const

export type OfficeCliInstallMethod = 'download' | 'reinstall'

export type OfficeCliInstallErrorCode =
  | 'unsupported-platform'
  | 'network'
  | 'checksum'
  | 'write-failed'
  | 'verify-failed'
  | 'busy'
  | 'unknown'

export type OfficeCliInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OfficeCliInstallProgress {
  phase: OfficeCliInstallProgressPhase
  message: string
}

export type OfficeCliInstallResult =
  | {
      ok: true
      version: string
      method: OfficeCliInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OfficeCliInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }
