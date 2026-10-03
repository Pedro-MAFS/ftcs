import { app, net } from 'electron'
import {
  getDownloadPageUrl,
  getUpdateManifestUrl,
} from '../config/site-origins'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import { beginUpdateDownload } from './update-download'
import { formatUpdateCheckMessage } from './update-check-message'
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
  /** 有则替换 Gitee 默认安装包地址 */
  setupUrl?: string
  /** 有则替换 GitHub 默认安装包地址 */
  setupUrlFallback?: string
  /** 有则下载完成后做 SHA-256；没有则不校验 */
  setupSha256?: string
}

export interface UpdateCheckResult {
  ok: boolean
  message: string
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  /** 有更新则为 true。忽略此版本 / 7 天稍后不再把这里压成 false。 */
  shouldNotify: boolean
  /** 当前版本低于 minVersion：只作标记，不因此静默安装，也不藏起「稍后」 */
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
  lastCheckedAt?: string
}

let inflight: Promise<UpdateCheckResult> | null = null

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

function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
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

async function performCheck(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion()
  const manifestUrl = getUpdateManifestUrl()
  try {
    const defaultDownloadPage = getDownloadPageUrl()
    const manifest = await fetchManifest(manifestUrl)
    const latestVersion = manifest.version.trim()
    const hasUpdate = isNewerVersion(latestVersion, currentVersion)
    const minVersion = manifest.minVersion?.trim()
    const mandatory = Boolean(minVersion) && isNewerVersion(minVersion!, currentVersion)
    const notes = Array.isArray(manifest.notes)
      ? manifest.notes.map((n) => String(n)).filter(Boolean)
      : []
    const downloadPage =
      (manifest.downloadPage && String(manifest.downloadPage).trim()) ||
      defaultDownloadPage
    const checkedAt = new Date().toISOString()
    writeUpdatePrefs({ lastCheckedAt: checkedAt })

    if (hasUpdate && process.platform === 'win32') {
      beginUpdateDownload({
        version: latestVersion,
        setupUrl: optionalTrimmed(manifest.setupUrl),
        setupUrlFallback: optionalTrimmed(manifest.setupUrlFallback),
        setupSha256: optionalTrimmed(manifest.setupSha256),
        downloadPage,
      })
    }

    return {
      ok: true,
      message: formatUpdateCheckMessage({
        ok: true,
        hasUpdate,
        currentVersion,
        latestVersion,
      }),
      currentVersion,
      latestVersion,
      hasUpdate,
      shouldNotify: hasUpdate,
      mandatory: mandatory && hasUpdate,
      title: manifest.title?.trim() || `FTCS Desktop ${latestVersion}`,
      notes,
      downloadPage,
      releasedAt: manifest.releasedAt?.trim() || null,
      checkedAt,
      manifestUrl,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      message: formatUpdateCheckMessage({
        ok: false,
        hasUpdate: false,
        currentVersion,
        latestVersion: null,
        errorMessage,
      }),
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      shouldNotify: false,
      mandatory: false,
      title: '',
      notes: [],
      downloadPage: getDownloadPageUrl(),
      releasedAt: null,
      checkedAt: new Date().toISOString(),
      manifestUrl,
    }
  }
}

/**
 * 拉取官网版本清单并与本地版本比较。
 * 同一时刻只飞一次；后来的调用（含手动检查）等待这一次的结果。
 * `forceNotify` 仍保留在入参里，兼容现有 IPC。忽略此版本和 7 天稍后不再改变结果，也不挡住下载。
 */
export function checkForAppUpdate(options?: {
  forceNotify?: boolean
}): Promise<UpdateCheckResult> {
  void options
  if (inflight) return inflight
  inflight = performCheck().finally(() => {
    inflight = null
  })
  return inflight
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
