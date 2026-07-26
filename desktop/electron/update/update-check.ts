import { app, net } from 'electron'
import {
  getDownloadPageUrl,
  getUpdateManifestUrl,
} from '../config/site-origins'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import { isNewerVersion } from './semver'

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

export interface UpdateManifest {
  version: string
  releasedAt?: string
  minVersion?: string
  title?: string
  notes?: string[]
  downloadPage?: string
}

export interface UpdateCheckResult {
  ok: boolean
  message: string
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  /** 是否应展示提醒（已忽略或稍后则 false；手动检查可 forceNotify） */
  shouldNotify: boolean
  /** 当前版本低于 minVersion：强提示 */
  mandatory: boolean
  title: string
  notes: string[]
  downloadPage: string
  releasedAt: string | null
  checkedAt: string
  manifestUrl: string
}

interface UpdatePrefs {
  dismissedVersion?: string
  snoozeUntil?: string
}

function readUpdatePrefs(): UpdatePrefs {
  return readUserPrefs().update ?? {}
}

function writeUpdatePrefs(patch: UpdatePrefs): UpdatePrefs {
  const next = { ...readUpdatePrefs(), ...patch }
  writeUserPrefs({ update: next })
  return next
}

function getCurrentVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

async function fetchManifest(url: string): Promise<UpdateManifest> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const doFetch =
      typeof net.fetch === 'function'
        ? net.fetch.bind(net)
        : globalThis.fetch.bind(globalThis)
    // 防 CDN/代理缓存旧清单：查询参数 + 禁用缓存头
    const bustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
    const res = await doFetch(bustUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as UpdateManifest
    if (!data || typeof data.version !== 'string' || !data.version.trim()) {
      throw new Error('清单缺少 version 字段')
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

function shouldShowNotify(
  latestVersion: string,
  prefs: UpdatePrefs,
  forceNotify: boolean,
): boolean {
  if (forceNotify) return true
  if (prefs.dismissedVersion && prefs.dismissedVersion === latestVersion) {
    return false
  }
  if (prefs.snoozeUntil) {
    const until = Date.parse(prefs.snoozeUntil)
    if (Number.isFinite(until) && Date.now() < until) return false
  }
  return true
}

/**
 * 拉取官网版本清单并与本地版本比较。
 * @param forceNotify 手动「检查更新」时为 true，忽略稍后/忽略此版本
 */
export async function checkForAppUpdate(options?: {
  forceNotify?: boolean
}): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion()
  const checkedAt = new Date().toISOString()
  const forceNotify = Boolean(options?.forceNotify)
  const prefs = readUpdatePrefs()

  try {
    const manifestUrl = getUpdateManifestUrl()
    const defaultDownloadPage = getDownloadPageUrl()
    const manifest = await fetchManifest(manifestUrl)
    const latestVersion = manifest.version.trim()
    const hasUpdate = isNewerVersion(latestVersion, currentVersion)
    const minVersion = manifest.minVersion?.trim()
    // current < minVersion → 必须升级
    const mandatory = Boolean(minVersion) && isNewerVersion(minVersion!, currentVersion)

    const notes = Array.isArray(manifest.notes)
      ? manifest.notes.map((n) => String(n)).filter(Boolean)
      : []
    const downloadPage =
      (manifest.downloadPage && String(manifest.downloadPage).trim()) ||
      defaultDownloadPage

    return {
      ok: true,
      message: hasUpdate
        ? `发现新版本 ${latestVersion}`
        : `已是最新版本（${currentVersion}）`,
      currentVersion,
      latestVersion,
      hasUpdate,
      shouldNotify:
        hasUpdate &&
        (mandatory || shouldShowNotify(latestVersion, prefs, forceNotify)),
      mandatory: mandatory && hasUpdate,
      title: manifest.title?.trim() || `FTCS Desktop ${latestVersion}`,
      notes,
      downloadPage,
      releasedAt: manifest.releasedAt?.trim() || null,
      checkedAt,
      manifestUrl,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      message: `检查更新失败：${message}`,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      shouldNotify: false,
      mandatory: false,
      title: '',
      notes: [],
      downloadPage: getDownloadPageUrl(),
      releasedAt: null,
      checkedAt,
      manifestUrl: getUpdateManifestUrl(),
    }
  }
}

export function snoozeAppUpdate(): UpdatePrefs {
  return writeUpdatePrefs({
    snoozeUntil: new Date(Date.now() + SNOOZE_MS).toISOString(),
  })
}

export function dismissAppUpdate(version: string): UpdatePrefs {
  return writeUpdatePrefs({
    dismissedVersion: version.trim(),
    snoozeUntil: undefined,
  })
}

export function getAppVersion(): string {
  return getCurrentVersion()
}
