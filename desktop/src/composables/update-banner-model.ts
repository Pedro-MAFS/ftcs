import type { UpdateCheckResult, UpdateDownloadState } from '../types/update'

export type UpdateBannerMode =
  | 'hidden'
  | 'check-error'
  | 'external'
  | 'downloading'
  | 'ready'
  | 'ready-deferred'
  | 'download-failed'

export interface UpdateUiInput {
  platform: string
  check: Pick<
    UpdateCheckResult,
    'ok' | 'message' | 'hasUpdate' | 'latestVersion' | 'currentVersion' | 'mandatory'
  >
  download: Pick<
    UpdateDownloadState,
    'phase' | 'version' | 'received' | 'total' | 'message' | 'deferred'
  >
  /** 用户在设置里点过「检查更新」或「重试」 */
  manualChecked: boolean
  manualChecking: boolean
}

export interface SettingsUpdateActions {
  line: string
  showInstall: boolean
  /** 非 Windows：现网「前往下载页」 */
  showGoDownload: boolean
  /** 检查失败或下载失败 */
  showOfficial: boolean
  showRetryCheck: boolean
  showRetryDownload: boolean
}

function isWindows(platform: string): boolean {
  return platform === 'win32'
}

export function resolveUpdateBannerMode(input: UpdateUiInput): UpdateBannerMode {
  const win = isWindows(input.platform)
  const dl = input.download
  const check = input.check

  if (win && dl.phase === 'downloading') return 'downloading'
  if (win && dl.phase === 'ready') return dl.deferred ? 'ready-deferred' : 'ready'
  if (!check.ok && check.message.trim()) return 'check-error'
  if (win && dl.phase === 'failed') return 'download-failed'
  if (check.ok && check.hasUpdate && !win) return 'external'
  if (check.ok && check.hasUpdate && win) return 'downloading'
  return 'hidden'
}

/** 没有总长时只显示「正在下载」，不编百分比。 */
export function downloadingBannerText(input: UpdateUiInput): {
  title: string
  percent: number | null
} {
  const version = input.download.version || input.check.latestVersion
  const total = input.download.total
  if (input.download.phase === 'downloading' && total != null && total > 0) {
    const percent = Math.min(100, Math.floor((input.download.received / total) * 100))
    return {
      title: version ? `正在下载 ${version}` : '正在下载',
      percent,
    }
  }
  if (input.download.phase === 'downloading') {
    return { title: '正在下载', percent: null }
  }
  return {
    title: version ? `正在下载 ${version}` : '正在下载',
    percent: null,
  }
}

export function resolveSettingsUpdateActions(input: UpdateUiInput): SettingsUpdateActions {
  const win = isWindows(input.platform)
  const dl = input.download
  const check = input.check
  const checkFailed = !check.ok && Boolean(check.message.trim())
  const version = dl.version || check.latestVersion

  let line = ''
  if (input.manualChecking) {
    line = '正在检查…'
  } else if (win && dl.phase === 'downloading' && version) {
    line = `发现新版本 ${version}，正在后台下载`
  } else if (win && dl.phase === 'ready' && version) {
    line = `已下载 ${version}`
  } else if (checkFailed) {
    line = check.message
  } else if (win && dl.phase === 'failed' && dl.message) {
    line = dl.message
  } else if (input.manualChecked && check.ok && check.hasUpdate && win && version) {
    line = `发现新版本 ${version}，正在后台下载`
  } else if (input.manualChecked && check.ok && check.hasUpdate && !win) {
    line = `${check.message}。可点击「前往下载页」获取安装包。`
  } else if (input.manualChecked && check.ok && !check.hasUpdate) {
    line = check.message
  }

  return {
    line,
    showInstall: win && dl.phase === 'ready' && Boolean(version),
    showGoDownload: !win && check.ok && check.hasUpdate,
    showOfficial: checkFailed || (win && dl.phase === 'failed'),
    showRetryCheck: checkFailed,
    showRetryDownload: win && dl.phase === 'failed' && !checkFailed,
  }
}
