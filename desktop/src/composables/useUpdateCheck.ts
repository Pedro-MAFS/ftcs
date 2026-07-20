import { computed, ref } from 'vue'
import type { UpdateCheckResult } from '../types/update'

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
  downloadPage: 'https://ai-utills.com/ftcs/download/',
  releasedAt: null,
  checkedAt: '',
  manifestUrl: '',
})

const result = ref<UpdateCheckResult>(emptyResult())
const bannerVisible = ref(false)
const checking = ref(false)
const appVersion = ref('')
let bootstrapped = false

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
    result.value = {
      ...emptyResult(),
      message: '当前环境不支持检查更新',
    }
    return result.value
  }
  checking.value = true
  try {
    const res = await window.ftcs.checkForUpdate(opts)
    result.value = res
    if (res.currentVersion) appVersion.value = res.currentVersion
    if (res.shouldNotify && res.hasUpdate) {
      bannerVisible.value = true
    } else if (opts?.forceNotify && !res.hasUpdate) {
      bannerVisible.value = false
    }
    return res
  } catch (err) {
    result.value = {
      ...emptyResult(),
      message: err instanceof Error ? err.message : String(err),
    }
    return result.value
  } finally {
    checking.value = false
  }
}

async function bootstrapUpdateCheck(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  await refreshAppVersion()
  // 稍延迟，避免与引导/OpenCode 启动抢焦点
  window.setTimeout(() => {
    void checkForUpdate({ forceNotify: false })
  }, 2500)
}

async function openDownloadPage(): Promise<void> {
  const url = result.value.downloadPage || 'https://ai-utills.com/ftcs/download/'
  if (!window.ftcs?.openExternal) return
  await window.ftcs.openExternal(url)
}

async function snooze(): Promise<void> {
  if (window.ftcs?.snoozeUpdate) await window.ftcs.snoozeUpdate()
  bannerVisible.value = false
}

async function dismiss(): Promise<void> {
  const version = result.value.latestVersion
  if (version && window.ftcs?.dismissUpdate) {
    await window.ftcs.dismissUpdate(version)
  }
  bannerVisible.value = false
}

function hideBanner(): void {
  bannerVisible.value = false
}

export function useUpdateCheck() {
  return {
    result,
    bannerVisible,
    checking,
    appVersion,
    hasUpdate: computed(() => result.value.hasUpdate),
    bootstrapUpdateCheck,
    checkForUpdate,
    openDownloadPage,
    snooze,
    dismiss,
    hideBanner,
    refreshAppVersion,
  }
}
