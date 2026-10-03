export interface UpdateCheckResult {
  ok: boolean
  message: string
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  shouldNotify: boolean
  mandatory: boolean
  title: string
  notes: string[]
  downloadPage: string
  releasedAt: string | null
  checkedAt: string
  manifestUrl: string
}

export type UpdateDownloadPhase = 'idle' | 'downloading' | 'ready' | 'failed'

export interface UpdateDownloadState {
  phase: UpdateDownloadPhase
  version: string | null
  received: number
  total: number | null
  message: string
  deferred: boolean
  downloadPage: string
  revision: number
}
