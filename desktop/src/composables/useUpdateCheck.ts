import { computed, ref } from 'vue'
import { changelogPageUrl, PRODUCT_LINKS } from '../config/links'
import type { UpdateCheckResult, UpdateDownloadState } from '../types/update'
import {
  downloadingBannerText,
  resolveUpdateBannerMode,
  type UpdateBannerMode,
} from './update-banner-model'

const emptyResult = (): UpdateCheckResult => ({
  ok: false,
  message: '',
  currentVersion: '',
  latestVersion: null,
  hasUpdate: false,
  shouldNotify: false,
  mandatory: false,
  title: '',
  notes: [],
  downloadPage: PRODUCT_LINKS.download,
  releasedAt: null,
  checkedAt: '',
  manifestUrl: '',
})

const emptyDownload = (): UpdateDownloadState => ({
  phase: 'idle',
  version: null,
  received: 0,
  total: null,
  message: '',
  deferred: false,
  downloadPage: '',
  revision: 0,
})

const result = ref<UpdateCheckResult>(emptyResult())
const downloadState = ref<UpdateDownloadState>(emptyDownload())
const checking = ref(false)
const appVersion = ref('')
const installError = ref('')
let bootstrapped = false
let progressUnsub: (() => void) | null = null
let checkedUnsub: (() => void) | null = null

function failureResult(message: string): UpdateCheckResult {
  const text = message.startsWith('检查更新失败') ? message : `检查更新失败：${message}`
  return {
    ...emptyResult(),
    ok: false,
    hasUpdate: false,
    shouldNotify: false,
    message: text,
  }
}

function applyCheckResult(res: UpdateCheckResult): void {
  result.value = res
  if (res.currentVersion) appVersion.value = res.currentVersion
}

function applyDownloadState(state: UpdateDownloadState): void {
  if (state.revision < downloadState.value.revision) return
  downloadState.value = state
  if (state.phase === 'downloading' || state.phase === 'ready') {
    installError.value = ''
  }
}

async function refreshDownloadState(): Promise<void> {
  if (!window.ftcs?.getUpdateState) return
  try {
    applyDownloadState(await window.ftcs.getUpdateState())
  } catch {
    // 状态拉取失败时保留已有横幅
  }
}

function ensureUpdateSubscriptions(): void {
  if (!progressUnsub && window.ftcs?.onUpdateProgress) {
    progressUnsub = window.ftcs.onUpdateProgress((state) => {
      applyDownloadState(state)
    })
  }
  if (!checkedUnsub && window.ftcs?.onUpdateChecked) {
    checkedUnsub = window.ftcs.onUpdateChecked((res) => {
      applyCheckResult(res)
      void refreshDownloadState()
    })
  }
}

async function refreshAppVersion(): Promise<string> {
  if (!window.ftcs?.getAppVersion) {
    appVersion.value = ''
    return ''
  }
  try {
    appVersion.value = await window.ftcs.getAppVersion()
  } catch {
    appVersion.value = ''
  }
  return appVersion.value
}

async function checkForUpdate(opts?: { forceNotify?: boolean }): Promise<UpdateCheckResult> {
  if (!window.ftcs?.checkForUpdate) {
    const failed = failureResult('当前环境不支持检查更新')
    applyCheckResult(failed)
    return failed
  }
  checking.value = true
  try {
    const res = await window.ftcs.checkForUpdate(opts)
    applyCheckResult(res)
    await refreshDownloadState()
    return res
  } catch (err) {
    const failed = failureResult(err instanceof Error ? err.message : String(err))
    applyCheckResult(failed)
    return failed
  } finally {
    checking.value = false
  }
}

async function bootstrapUpdateCheck(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  ensureUpdateSubscriptions()
  await refreshAppVersion()
  await refreshDownloadState()
  // 稍延迟，避免与引导/OpenCode 启动抢焦点
  window.setTimeout(() => {
    void checkForUpdate({ forceNotify: false })
  }, 2500)
}

async function openChangelogPage(): Promise<void> {
  const url = changelogPageUrl({
    from: result.value.currentVersion || appVersion.value || undefined,
    to: result.value.latestVersion || undefined,
  })
  if (!window.ftcs?.openExternal) return
  await window.ftcs.openExternal(url)
}

async function openDownloadPage(): Promise<void> {
  const url =
    (downloadState.value.phase === 'failed' && downloadState.value.downloadPage) ||
    result.value.downloadPage ||
    downloadState.value.downloadPage ||
    PRODUCT_LINKS.download
  if (!window.ftcs?.openExternal) return
  await window.ftcs.openExternal(url)
}

async function retryCheck(): Promise<void> {
  await checkForUpdate({ forceNotify: true })
}

async function retryDownload(): Promise<void> {
  installError.value = ''
  if (!window.ftcs?.retryUpdateDownload) return
  applyDownloadState(await window.ftcs.retryUpdateDownload())
}

async function installUpdate(): Promise<void> {
  installError.value = ''
  if (!window.ftcs?.installUpdate) {
    installError.value = '无法启动安装程序'
    return
  }
  try {
    const res = await window.ftcs.installUpdate()
    if (!res?.ok) installError.value = res?.message || '无法启动安装程序'
  } catch {
    installError.value = '无法启动安装程序'
  }
}

async function deferUpdate(): Promise<void> {
  if (!window.ftcs?.deferUpdate) return
  applyDownloadState(await window.ftcs.deferUpdate())
}

const platform = computed(() => window.ftcs?.platform ?? 'win32')

const uiInput = computed(() => ({
  platform: platform.value,
  check: result.value,
  download: downloadState.value,
  manualChecked: false,
  manualChecking: false,
}))

const bannerMode = computed<UpdateBannerMode>(() => resolveUpdateBannerMode(uiInput.value))

const downloadingText = computed(() => downloadingBannerText(uiInput.value))

export function useUpdateCheck() {
  return {
    result,
    downloadState,
    checking,
    appVersion,
    installError,
    bannerMode,
    downloadingText,
    isWindowsPlatform: computed(() => platform.value === 'win32'),
    hasUpdate: computed(() => result.value.hasUpdate),
    bootstrapUpdateCheck,
    checkForUpdate,
    openDownloadPage,
    openChangelogPage,
    retryCheck,
    retryDownload,
    installUpdate,
    deferUpdate,
    refreshAppVersion,
  }
}
