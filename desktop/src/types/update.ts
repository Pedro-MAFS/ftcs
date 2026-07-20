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
