<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Icon from '../components/shared/Icon.vue'
import { useAppStatus } from '../composables/useAppStatus'
import { useAuth } from '../composables/useAuth'
import { useSettingsNav } from '../composables/useSettingsNav'
import { SECTION_META } from '../types/workspace'
import type { ChannelMode, GoogleProxyMode, SettingsSnapshot } from '../types/settings'
import type { ExploreR2SiteDto } from '../types/electron'
import { OFFICIAL_MODEL_CATALOG } from '../types/settings'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { PRODUCT_LINKS } from '../config/links'
import { shareAppDownload } from '../composables/useShareApp'
import { useOnboarding } from '../composables/useOnboarding'
import { useUpdateCheck } from '../composables/useUpdateCheck'
import { showToast } from '../composables/useToast'
import { useUiTheme } from '../composables/useUiTheme'
import type { UiThemeMode } from '../utils/ui-theme'

const {
  mode: uiThemeMode,
  setMode: setUiThemeMode,
  syncFromSettings: syncUiThemeFromSettings,
} = useUiTheme()

const meta = SECTION_META.settings
const { status, runtimeHealthy, runtimeLabel, loading, restartOpenCode, refresh } =
  useAppStatus()
const {
  session: authSession,
  loggedIn,
  loginPending,
  emailMasked,
  busy: authBusy,
  login,
  cancelLogin,
  logout,
  openFeedback,
} = useAuth()
const { activeCategory, setCategory } = useSettingsNav()
const { reopen: reopenOnboarding } = useOnboarding()
const {
  appVersion,
  checking: updateChecking,
  result: updateResult,
  checkForUpdate,
  openDownloadPage,
  openChangelogPage,
  refreshAppVersion,
} = useUpdateCheck()
const updateHint = ref('')
const confirmLogout = ref(false)
const confirmResetGateway = ref(false)
const authHint = ref('')

const saving = ref(false)
const provisioning = ref(false)
const refreshingModels = ref(false)
const refreshingUsage = ref(false)
const openingRecharge = ref(false)
const openingPortal = ref(false)
const message = ref('')
const error = ref('')

watch(message, (msg) => {
  const text = msg.trim()
  if (!text) return
  showToast(text, { tone: 'success' })
  message.value = ''
})

watch(error, (msg) => {
  const text = msg.trim()
  if (!text) return
  showToast(text, { tone: 'error' })
  error.value = ''
})
const showApiKey = ref(false)
const showTavilyKey = ref(false)
const showPlacesKey = ref(false)
const showHunterKeys = ref(false)
const hunterKeySlots = ref<string[]>([''])
const HUNTER_KEYS_MAX = 5
const placesTestMessage = ref('')
const placesTestOk = ref<boolean | null>(null)
const hunterTestMessage = ref('')
const hunterTestOk = ref<boolean | null>(null)
const testingHunter = ref(false)
const detectingProxy = ref(false)
const testingPlaces = ref(false)
const proxyDetectMessage = ref('')
const snapshot = ref<SettingsSnapshot | null>(null)
const r2Sites = ref<ExploreR2SiteDto[]>([])
const r2SitesHint = ref('')

const form = reactive({
  channelMode: 'official' as ChannelMode,
  apiKey: '',
  baseUrl: '',
  model: 'deepseek/deepseek-v4-pro',
  smallModel: 'deepseek/deepseek-v4-flash',
  customModelId: '',
  customSmallModelId: '',
  searchProvider: 'tavily',
  tavilyApiKey: '',
  placesApiKey: '',
  hunterVerifyEmails: true,
  googleProxyMode: 'system' as GoogleProxyMode,
  googleProxyManualUrl: 'http://127.0.0.1:7890',
  searchDailyLimit: 50,
  customModelSupportsImage: false,
  emailDraftStylePrompt: '专业，真诚',
  taskDoneNotificationEnabled: true,
  openAtLogin: false,
  closeToTrayEnabled: false,
  uiThemeMode: 'dark' as UiThemeMode,
  exploreIntensity: 'medium' as 'low' | 'medium' | 'high',
})

watch(uiThemeMode, (next) => {
  form.uiThemeMode = next
})

const EXPLORE_INTENSITY_OPTIONS: Array<{
  id: 'low' | 'medium' | 'high'
  label: string
  summary: string
}> = [
  {
    id: 'low',
    label: '低',
    summary: 'R1 约 20 词，每个社媒和地图词约 10；搜索每次 3 条；地图每次最多 10 条。',
  },
  {
    id: 'medium',
    label: '中',
    summary: 'R1 约 40 词，每个社媒和地图词约 20；搜索每次 5 条；地图每次最多 20 条。',
  },
  {
    id: 'high',
    label: '高',
    summary: 'R1 约 60 词，每个社媒和地图词约 40；搜索每次 10 条；地图每次最多 40 条。',
  },
]

const exploreIntensitySummary = computed(
  () =>
    EXPLORE_INTENSITY_OPTIONS.find((o) => o.id === form.exploreIntensity)
      ?.summary ?? EXPLORE_INTENSITY_OPTIONS[1].summary,
)

const EMAIL_DRAFT_STYLE_PROMPT_MAX = 500
const DEFAULT_EMAIL_DRAFT_STYLE_PROMPT = '专业，真诚'

const emailStyleCharCount = computed(
  () => [...form.emailDraftStylePrompt].length,
)

const channels: Array<{ id: ChannelMode; label: string }> = [
  { id: 'official', label: '官方通道' },
  { id: 'custom', label: '自定义' },
]

const categories: Array<{ id: typeof activeCategory.value; label: string }> = [
  { id: 'account', label: '账号与授权' },
  { id: 'model', label: '模型通道' },
  { id: 'search', label: '搜索服务' },
  { id: 'explore', label: '探索' },
  { id: 'integrations', label: '集成' },
  { id: 'outreach', label: '开发信' },
  { id: 'appearance', label: '外观' },
  { id: 'startup', label: '启动与托盘' },
  { id: 'notifications', label: '通知' },
  { id: 'workspace', label: '工作区' },
  { id: 'opencode', label: 'OpenCode 运行时' },
  { id: 'about', label: '关于与隐私' },
]

const accessExpireLabel = computed(() => {
  const sec = authSession.value.accessExpiresInSec
  if (sec == null) return '—'
  if (sec <= 0) return '已过期或即将刷新'
  const m = Math.floor(sec / 60)
  return m > 0 ? `约 ${m} 分钟后` : `约 ${sec} 秒后`
})

async function onAuthLogin(): Promise<void> {
  authHint.value = '正在打开浏览器…'
  const res = await login()
  authHint.value = res.message
}

async function onAuthFeedback(): Promise<void> {
  const res = await openFeedback()
  authHint.value = res.message
  if (res.needLogin) {
    authHint.value = '意见反馈需要先登录'
  }
}

async function onAuthLogout(): Promise<void> {
  confirmLogout.value = false
  const res = await logout()
  authHint.value = res.message
}

async function openProductLink(url: string): Promise<void> {
  if (!window.ftcs?.openExternal) {
    error.value = '当前环境无法打开外链'
    return
  }
  try {
    const res = await window.ftcs.openExternal(url)
    if (!res.ok) error.value = res.message
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

const shareHint = ref('')

async function onShareApp(): Promise<void> {
  const res = await shareAppDownload()
  shareHint.value = res.message
}

const isCustom = computed(() => form.channelMode === 'custom')
const isOfficial = computed(() => form.channelMode === 'official')
const usagePct = computed(() => {
  const limit = form.searchDailyLimit || 1
  const used = snapshot.value?.searchUsedToday ?? 0
  return Math.min(100, Math.round((used / limit) * 100))
})

const modelOptions = computed(() => {
  const fromSnap = snapshot.value?.modelOptions
  if (fromSnap && fromSnap.length > 0) return fromSnap
  return OFFICIAL_MODEL_CATALOG.models
})
const smallModelOptions = computed(() => {
  const fromSnap = snapshot.value?.smallModelOptions
  if (fromSnap && fromSnap.length > 0) return fromSnap
  return OFFICIAL_MODEL_CATALOG.small
})
const modelsDisabled = computed(
  () => isOfficial.value && !snapshot.value?.officialProvisioned,
)
const showUsageCard = computed(
  () => isOfficial.value && Boolean(snapshot.value?.officialProvisioned),
)
const usage = computed(() => snapshot.value?.officialUsage ?? null)
const balanceDisplay = computed(() => {
  const u = usage.value
  if (!u) return '—'
  const neg = u.balanceLi < 0
  const body = u.balanceDisplay.startsWith('-')
    ? u.balanceDisplay.slice(1)
    : u.balanceDisplay
  return neg ? `-¥${body}` : `¥${body}`
})
const balanceWarn = computed(() => (usage.value?.balanceLi ?? 0) <= 0)
const todayPromptLabel = computed(() => {
  const v = usage.value?.todayPromptTokens
  return v == null ? '—' : String(v)
})
const todayCompletionLabel = computed(() => {
  const v = usage.value?.todayCompletionTokens
  return v == null ? '—' : String(v)
})

/** 需点「保存配置」才落盘的字段快照（不含主题 / 开机自启 / 关闭进托盘） */
type SaveableSettingsFingerprint = {
  channelMode: string
  apiKey: string
  baseUrl: string
  model: string
  smallModel: string
  customModelId: string
  customSmallModelId: string
  searchProvider: string
  tavilyApiKey: string
  placesApiKey: string
  hunterKeys: string
  hunterVerifyEmails: boolean
  googleProxyMode: string
  googleProxyManualUrl: string
  searchDailyLimit: number
  customModelSupportsImage: boolean
  emailDraftStylePrompt: string
  taskDoneNotificationEnabled: boolean
}

const saveableBaseline = ref<SaveableSettingsFingerprint | null>(null)

function captureSaveableFingerprint(): SaveableSettingsFingerprint {
  return {
    channelMode: form.channelMode,
    apiKey: form.apiKey,
    baseUrl: form.baseUrl,
    model: form.model,
    smallModel: form.smallModel,
    customModelId: form.customModelId,
    customSmallModelId: form.customSmallModelId,
    searchProvider: form.searchProvider,
    tavilyApiKey: form.tavilyApiKey,
    placesApiKey: form.placesApiKey,
    hunterKeys: hunterKeySlots.value.map((k) => String(k)).join('\n'),
    hunterVerifyEmails: form.hunterVerifyEmails,
    googleProxyMode: form.googleProxyMode,
    googleProxyManualUrl: form.googleProxyManualUrl,
    searchDailyLimit: form.searchDailyLimit,
    customModelSupportsImage: form.customModelSupportsImage,
    emailDraftStylePrompt: form.emailDraftStylePrompt,
    taskDoneNotificationEnabled: form.taskDoneNotificationEnabled,
  }
}

function markSaveableBaseline(): void {
  saveableBaseline.value = captureSaveableFingerprint()
}

const settingsDirty = computed(() => {
  if (!saveableBaseline.value) return false
  return (
    JSON.stringify(captureSaveableFingerprint()) !==
    JSON.stringify(saveableBaseline.value)
  )
})

const saveDisabled = computed(() => saving.value || loading.value || !settingsDirty.value)
const resetDisabled = computed(() => saving.value || loading.value || !settingsDirty.value)

function applySnapshot(data: SettingsSnapshot): void {
  snapshot.value = data
  form.channelMode = data.channelMode
  form.apiKey = data.apiKeyMasked
  form.baseUrl = data.baseUrl
  form.model = data.model
  form.smallModel = data.smallModel
  form.searchProvider = data.searchProvider
  form.tavilyApiKey = data.tavilyApiKeyMasked
  form.placesApiKey = data.placesApiKeyMasked
  const maskedSlots = data.hunterApiKeysMasked
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, HUNTER_KEYS_MAX)
  hunterKeySlots.value = maskedSlots.length > 0 ? maskedSlots : ['']
  form.hunterVerifyEmails = data.hunterVerifyEmails
  form.googleProxyMode = data.googleProxyMode
  form.googleProxyManualUrl =
    data.googleProxyManualUrl || 'http://127.0.0.1:7890'
  form.searchDailyLimit = data.searchDailyLimit
  form.customModelSupportsImage = data.customModelSupportsImage
  form.emailDraftStylePrompt =
    data.emailDraftStylePrompt?.trim() || DEFAULT_EMAIL_DRAFT_STYLE_PROMPT
  form.taskDoneNotificationEnabled = data.taskDoneNotificationEnabled !== false
  form.openAtLogin = data.openAtLogin === true
  form.closeToTrayEnabled = data.closeToTrayEnabled === true
  form.uiThemeMode = (data.uiThemeMode as UiThemeMode) || 'dark'
  form.exploreIntensity =
    data.exploreIntensity === 'low' || data.exploreIntensity === 'high'
      ? data.exploreIntensity
      : 'medium'
  syncUiThemeFromSettings(form.uiThemeMode)
  if (data.channelMode === 'custom') {
    form.customModelId = data.model.includes('/')
      ? data.model.split('/').slice(1).join('/')
      : data.model
    form.customSmallModelId = data.smallModel.includes('/')
      ? data.smallModel.split('/').slice(1).join('/')
      : data.smallModel
  } else {
    const opts = data.modelOptions.length
      ? data.modelOptions
      : OFFICIAL_MODEL_CATALOG.models
    if (!opts.some((m) => m.id === form.model)) {
      form.model = opts[0]?.id || OFFICIAL_MODEL_CATALOG.models[0].id
    }
    const smallOpts = data.smallModelOptions.length
      ? data.smallModelOptions
      : OFFICIAL_MODEL_CATALOG.small
    if (!smallOpts.some((m) => m.id === form.smallModel)) {
      form.smallModel = smallOpts[0]?.id || OFFICIAL_MODEL_CATALOG.small[0].id
    }
  }
  markSaveableBaseline()
}

async function loadSettings(): Promise<void> {
  if (!window.ftcs?.getSettings) {
    error.value = '未检测到设置 API（请在桌面应用中运行）'
    return
  }
  try {
    const data = await window.ftcs.getSettings()
    applySnapshot(data)
    error.value = ''
    if (data.channelMode === 'official' && data.officialProvisioned) {
      await Promise.all([refreshOfficialModelsQuiet(), refreshOfficialUsageQuiet()])
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function refreshOfficialModelsQuiet(): Promise<void> {
  if (!window.ftcs?.refreshOfficialModels) return
  refreshingModels.value = true
  try {
    const res = await window.ftcs.refreshOfficialModels()
    applySnapshot(res.settings)
    if (!res.ok && res.message) {
      error.value = res.message
    }
  } finally {
    refreshingModels.value = false
  }
}

async function refreshOfficialUsageQuiet(): Promise<void> {
  if (!window.ftcs?.refreshOfficialUsage) return
  refreshingUsage.value = true
  try {
    const res = await window.ftcs.refreshOfficialUsage()
    applySnapshot(res.settings)
  } finally {
    refreshingUsage.value = false
  }
}

async function openOfficialRecharge(): Promise<void> {
  if (!window.ftcs?.openOfficialRecharge) return
  openingRecharge.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.openOfficialRecharge()
    if (res.ok) {
      message.value = res.message || '已在浏览器打开充值页'
      return
    }
    if (res.needLogin) {
      authHint.value = '请先登录后再充值'
      error.value = '请先登录后再充值'
      return
    }
    error.value = res.message || '无法打开充值页'
  } finally {
    openingRecharge.value = false
  }
}

async function openOfficialPortal(): Promise<void> {
  if (!window.ftcs?.openOfficialPortal) return
  openingPortal.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.openOfficialPortal()
    if (res.ok) {
      message.value = res.message || '已在浏览器打开账户面板'
      return
    }
    if (res.needLogin) {
      authHint.value = '请先登录后再查看账户详情'
      error.value = '请先登录后再查看账户详情'
      return
    }
    error.value = res.message || '无法打开账户面板'
  } finally {
    openingPortal.value = false
  }
}

async function onProvisionOfficial(reset = false): Promise<void> {
  if (!window.ftcs?.provisionOfficialChannel) return
  if (!loggedIn.value) {
    error.value = '请先登录后再开通官方通道'
    return
  }
  provisioning.value = true
  message.value = reset ? '正在重置网关凭证…' : '正在开通官方通道…'
  error.value = ''
  try {
    const res = await window.ftcs.provisionOfficialChannel({ reset })
    applySnapshot(res.settings)
    if (res.ok) {
      message.value = res.message
      await refresh()
    } else {
      message.value = ''
      error.value = res.message
      if (res.needLogin) authHint.value = '请先登录'
    }
  } catch (err) {
    message.value = ''
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    provisioning.value = false
    confirmResetGateway.value = false
  }
}

watch(
  () => form.channelMode,
  (mode) => {
    if (mode === 'official') {
      form.searchProvider = 'gateway'
      const opts = modelOptions.value
      if (opts.length && !opts.some((m) => m.id === form.model)) {
        form.model = opts[0].id
      }
      const smalls = smallModelOptions.value
      if (smalls.length && !smalls.some((m) => m.id === form.smallModel)) {
        form.smallModel = smalls[0].id
      }
      return
    }
    if (form.searchProvider === 'gateway') {
      form.searchProvider = 'tavily'
    }
    if (!Number.isFinite(form.searchDailyLimit) || form.searchDailyLimit >= 999999) {
      form.searchDailyLimit = 50
    }
  },
)

watch(
  () => activeCategory.value,
  (cat) => {
    if (
      cat === 'model' &&
      form.channelMode === 'official' &&
      snapshot.value?.officialProvisioned
    ) {
      void refreshOfficialUsageQuiet()
    }
  },
)

async function onSave(): Promise<void> {
  if (!window.ftcs?.saveSettings) return
  saving.value = true
  message.value = ''
  error.value = ''
  try {
    const model =
      form.channelMode === 'custom'
        ? form.customModelId.trim() || 'default'
        : form.model
    const smallModel =
      form.channelMode === 'custom'
        ? form.customSmallModelId.trim() || form.customModelId.trim() || 'default'
        : form.smallModel

    const result = await window.ftcs.saveSettings({
      channelMode: form.channelMode,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl,
      model,
      smallModel,
      searchProvider: form.searchProvider,
      tavilyApiKey: form.tavilyApiKey,
      placesApiKey: form.placesApiKey,
      hunterApiKeys: hunterKeySlots.value.map((key) => String(key)),
      hunterVerifyEmails: form.hunterVerifyEmails,
      googleProxyMode: form.googleProxyMode,
      googleProxyManualUrl: form.googleProxyManualUrl,
      searchDailyLimit: form.searchDailyLimit,
      customModelSupportsImage: form.customModelSupportsImage,
      emailDraftStylePrompt: form.emailDraftStylePrompt,
      taskDoneNotificationEnabled: form.taskDoneNotificationEnabled,
      openAtLogin: form.openAtLogin,
      closeToTrayEnabled: form.closeToTrayEnabled,
      uiThemeMode: form.uiThemeMode,
    })
    applySnapshot(result.settings)
    if (!result.ok) {
      error.value = result.message
      return
    }
    message.value = result.message
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onUiThemeChange(): Promise<void> {
  await setUiThemeMode(form.uiThemeMode)
}

async function onExploreIntensityChange(): Promise<void> {
  if (!window.ftcs?.setExploreIntensity) return
  try {
    const res = await window.ftcs.setExploreIntensity(form.exploreIntensity)
    if (res.ok) {
      form.exploreIntensity = res.exploreIntensity
      const label =
        EXPLORE_INTENSITY_OPTIONS.find((o) => o.id === form.exploreIntensity)
          ?.label ?? '中'
      showToast(`已设为${label}探索强度`, { tone: 'success' })
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function onOpenAtLoginChange(): Promise<void> {
  if (!window.ftcs?.setOpenAtLogin) return
  try {
    const res = await window.ftcs.setOpenAtLogin(form.openAtLogin)
    if (res.ok) {
      form.openAtLogin = res.openAtLogin
      showToast(form.openAtLogin ? '已开启开机自启' : '已关闭开机自启', {
        tone: 'success',
      })
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function onCloseToTrayChange(): Promise<void> {
  if (!window.ftcs?.setCloseToTray) return
  try {
    const res = await window.ftcs.setCloseToTray(form.closeToTrayEnabled)
    if (res.ok) {
      form.closeToTrayEnabled = res.closeToTrayEnabled
      showToast(
        form.closeToTrayEnabled
          ? '已开启：关闭窗口时最小化到托盘'
          : '已关闭：关闭窗口将退出应用',
        { tone: 'success' },
      )
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function onReset(): Promise<void> {
  await loadSettings()
}

async function onDetectGoogleProxy(): Promise<void> {
  if (!window.ftcs?.detectGoogleProxy) return
  detectingProxy.value = true
  proxyDetectMessage.value = ''
  try {
    const result = await window.ftcs.detectGoogleProxy()
    proxyDetectMessage.value = result.message
    if (result.url && form.googleProxyMode === 'system') {
      form.googleProxyManualUrl = result.url
    }
  } catch (err) {
    proxyDetectMessage.value =
      err instanceof Error ? err.message : String(err)
  } finally {
    detectingProxy.value = false
  }
}

async function onTestGooglePlaces(): Promise<void> {
  if (!window.ftcs?.testGooglePlaces) return
  testingPlaces.value = true
  placesTestMessage.value = ''
  placesTestOk.value = null
  try {
    const result = await window.ftcs.testGooglePlaces({
      mode: form.googleProxyMode,
      manualProxyUrl:
        form.googleProxyMode === 'manual'
          ? form.googleProxyManualUrl
          : undefined,
    })
    placesTestOk.value = result.ok
    placesTestMessage.value = result.message
  } catch (err) {
    placesTestOk.value = false
    placesTestMessage.value =
      err instanceof Error ? err.message : String(err)
  } finally {
    testingPlaces.value = false
  }
}

function addHunterKeySlot(): void {
  if (hunterKeySlots.value.length >= HUNTER_KEYS_MAX) return
  hunterKeySlots.value = [...hunterKeySlots.value, '']
}

function removeHunterKeySlot(index: number): void {
  const next = hunterKeySlots.value.filter((_, i) => i !== index)
  hunterKeySlots.value = next.length > 0 ? next : ['']
}

async function onTestHunter(): Promise<void> {
  if (!window.ftcs?.testHunter) return
  testingHunter.value = true
  hunterTestMessage.value = ''
  hunterTestOk.value = null
  try {
    const result = await window.ftcs.testHunter()
    hunterTestOk.value = result.ok
    const lines = result.keys.map(
      (k) =>
        `…${k.tail}: ${k.ok ? k.message : k.message}${
          k.resetDate ? `（重置 ${k.resetDate}）` : ''
        }`,
    )
    hunterTestMessage.value = [result.message, ...lines].filter(Boolean).join(' · ')
  } catch (err) {
    hunterTestOk.value = false
    hunterTestMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    testingHunter.value = false
  }
}

async function onResetSettings(): Promise<void> {
  await loadSettings()
  message.value = '已从磁盘重新加载配置'
}

async function onPickWorkspace(): Promise<void> {
  if (!window.ftcs?.pickWorkspace) return
  try {
    const result = await window.ftcs.pickWorkspace()
    if (result.path && 'settings' in result && result.settings) {
      applySnapshot(result.settings as SettingsSnapshot)
      const initReason =
        result && 'init' in result && result.init && typeof result.init === 'object'
          ? String((result.init as { reason?: string }).reason ?? '')
          : ''
      message.value = initReason
        ? `工作区已切换并初始化：${initReason}`
        : `工作区已切换为 ${result.path}，OpenCode 已重启`
      await refresh()
      await loadR2Sites()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function scrollTo(category: typeof activeCategory.value): void {
  setCategory(category)
  const el = document.getElementById(`settings-${category}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function loadR2Sites(): Promise<void> {
  if (!window.ftcs?.getExploreR2Sites) return
  try {
    const res = await window.ftcs.getExploreR2Sites()
    if (res.ok) {
      r2Sites.value = res.sites
      return
    }
    r2SitesHint.value = res.message || '无法读取 R2 站点'
  } catch (err) {
    r2SitesHint.value = err instanceof Error ? err.message : String(err)
  }
}

async function onR2SiteToggle(siteId: string, event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  if (!window.ftcs?.setExploreR2SiteEnabled) return
  r2SitesHint.value = ''
  const res = await window.ftcs.setExploreR2SiteEnabled(siteId, enabled)
  if (res.ok) {
    r2Sites.value = res.sites
    r2SitesHint.value = '已保存，下次生成关键词时生效'
    return
  }
  error.value = res.message || '保存站点开关失败'
  await loadR2Sites()
}

onMounted(() => {
  void loadSettings()
  void loadR2Sites()
  void refreshAppVersion()
})

async function onCheckUpdate(): Promise<void> {
  updateHint.value = '正在检查…'
  const res = await checkForUpdate({ forceNotify: true })
  updateHint.value = res.message
  if (res.ok && res.hasUpdate) {
    updateHint.value = `${res.message}。可点击「前往下载页」获取安装包。`
  }
}
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" :disabled="resetDisabled" @click="onReset">
          重置
        </button>
        <button type="button" class="btn-primary" :disabled="saveDisabled" @click="onSave">
          <Icon name="save" :size="12" />
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="settings-nav__item"
          :class="{ 'is-active': activeCategory === cat.id }"
          @click="scrollTo(cat.id)"
        >
          {{ cat.label }}
        </button>
      </nav>

      <div class="settings-form">
        <!-- 账号与授权 -->
        <section id="settings-account" class="settings-block">
          <div class="settings-block__head">
            <h3>账号与授权</h3>
            <span
              class="mcp-badge"
              :class="{ ok: loggedIn }"
            >
              {{ loggedIn ? '已登录' : '未登录' }}
            </span>
          </div>

          <template v-if="loggedIn">
            <div class="auth-account-card">
              <span class="auth-account-card__avatar">
                {{ (emailMasked || '?').slice(0, 1).toUpperCase() }}
              </span>
              <div class="auth-account-card__meta">
                <strong>{{ emailMasked }}</strong>
                <span class="muted">掩码展示 · 完整邮箱仅用于反馈提交</span>
              </div>
            </div>
            <div class="about-row">
              <span class="muted">授权服务器</span>
              <span class="mono">{{ (authSession.issuer || '').replace(/^https?:\/\//, '') || '—' }}</span>
            </div>
            <div class="about-row">
              <span class="muted">Access 过期</span>
              <span class="mono">{{ accessExpireLabel }}</span>
            </div>
            <div class="about-row">
              <span class="muted">回调</span>
              <span class="mono">loopback · {{ authSession.redirectUri }}</span>
            </div>
            <div class="settings-actions-row">
              <button
                type="button"
                class="btn-secondary btn-sm"
                :disabled="authBusy"
                @click="onAuthFeedback"
              >
                <Icon name="message-square" :size="12" />
                意见反馈
              </button>
              <button
                type="button"
                class="btn-secondary btn-sm is-danger-outline"
                :disabled="authBusy"
                @click="confirmLogout = true"
              >
                <Icon name="log-out" :size="12" />
                退出登录
              </button>
            </div>
          </template>
          <template v-else>
            <p class="hint-line">
              <Icon name="info" :size="12" />
              未登录也可使用工作区功能。意见反馈等账号能力需要先登录。
            </p>
            <div class="settings-actions-row">
              <button
                type="button"
                class="btn-primary btn-sm"
                :disabled="authBusy || loginPending"
                @click="onAuthLogin"
              >
                <Icon name="log-in" :size="12" />
                {{ loginPending ? '登录中…' : '使用账号登录' }}
              </button>
              <button
                v-if="loginPending"
                type="button"
                class="btn-secondary btn-sm"
                @click="cancelLogin"
              >
                取消
              </button>
            </div>
          </template>
          <p v-if="authHint" class="hint-line">{{ authHint }}</p>
        </section>

        <hr class="settings-divider" />

        <!-- 模型通道 -->
        <section id="settings-model" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>模型通道</h3>
              <button
                type="button"
                class="help-link-btn"
                title="官方通道与自定义有什么区别？"
                aria-label="官方通道与自定义有什么区别？"
                @click="openProductLink(PRODUCT_LINKS.docsFaqModel)"
              >
                <Icon name="help-circle" :size="14" />
              </button>
            </div>
            <span class="muted mono">.env · FTCS_CHANNEL_MODE</span>
          </div>

          <label class="field-label">通道</label>
          <div class="provider-row">
            <button
              v-for="c in channels"
              :key="c.id"
              type="button"
              class="provider-chip"
              :class="{ 'is-active': form.channelMode === c.id }"
              @click="form.channelMode = c.id"
            >
              {{ c.label }}
            </button>
          </div>

          <template v-if="isOfficial">
            <p class="hint-line">
              经公司 Token 网关调用官方模型（DeepSeek / GLM / Qwen 等，以网关列表为准），费用从账户余额扣除；无需自备上游 API Key。
              <span v-if="snapshot?.gatewayBaseUrl" class="muted mono">
                · {{ snapshot.gatewayBaseUrl }}
              </span>
            </p>
            <div class="active-banner">
              <Icon name="info" :size="14" />
              <span v-if="!loggedIn">
                官方通道需要登录。请先登录用户中心，登录后即可开通。
              </span>
              <span v-else-if="!snapshot?.officialProvisioned">
                已登录。请开通官方通道以获取网关凭证。
              </span>
              <span v-else>
                官方通道已开通
                <template v-if="snapshot.gatewayKeyMasked">
                  · <code>{{ snapshot.gatewayKeyMasked }}</code>
                </template>
              </span>
              <button
                v-if="!loggedIn"
                type="button"
                class="btn-primary btn-sm"
                style="margin-left: auto"
                :disabled="authBusy || loginPending"
                @click="onAuthLogin"
              >
                {{ loginPending ? '登录中…' : '去登录' }}
              </button>
              <button
                v-else-if="!snapshot?.officialProvisioned"
                type="button"
                class="btn-primary btn-sm"
                style="margin-left: auto"
                :disabled="provisioning"
                @click="onProvisionOfficial(false)"
              >
                {{ provisioning ? '开通中…' : '开通官方通道' }}
              </button>
              <button
                v-else
                type="button"
                class="btn-secondary btn-sm"
                style="margin-left: auto"
                :disabled="provisioning"
                @click="confirmResetGateway = true"
              >
                重置网关凭证
              </button>
            </div>

            <p v-if="snapshot?.officialModelsError" class="hint-line" style="color: var(--danger, #c44)">
              {{ snapshot.officialModelsError }}
              <button
                v-if="snapshot.officialProvisioned"
                type="button"
                class="text-link-btn"
                :disabled="refreshingModels"
                @click="refreshOfficialModelsQuiet"
              >
                {{ refreshingModels ? '加载中…' : '重试加载模型' }}
              </button>
            </p>
            <p v-else-if="modelsDisabled" class="hint-line">开通后从网关加载可选模型</p>

            <div v-if="showUsageCard" class="usage-card">
              <div class="usage-card__head">
                <span class="usage-card__title">账户用量</span>
                <div class="usage-card__actions">
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    :disabled="openingPortal || openingRecharge || refreshingUsage"
                    @click="openOfficialPortal"
                  >
                    {{ openingPortal ? '打开中…' : '详情' }}
                  </button>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    :disabled="openingRecharge || openingPortal || refreshingUsage"
                    @click="openOfficialRecharge"
                  >
                    {{ openingRecharge ? '打开中…' : '充值' }}
                  </button>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    :disabled="refreshingUsage || openingRecharge || openingPortal"
                    @click="refreshOfficialUsageQuiet"
                  >
                    {{ refreshingUsage ? '刷新中…' : '刷新' }}
                  </button>
                </div>
              </div>
              <div class="usage-card__row">
                <span class="muted">账户余额</span>
                <span
                  class="mono usage-card__balance"
                  :class="{ 'is-warn': balanceWarn }"
                >
                  {{ refreshingUsage && !usage ? '…' : balanceDisplay }}
                </span>
              </div>
              <div class="usage-card__row">
                <span class="muted">今日 Token</span>
                <span class="mono muted">
                  输入 {{ todayPromptLabel }} · 输出 {{ todayCompletionLabel }}
                </span>
              </div>
              <p v-if="usage?.error" class="hint-line" style="color: var(--danger, #c44)">
                {{ usage.error }}
              </p>
              <p v-else class="hint-line">
                余额来自 Token 网关；今日用量即将支持
              </p>
            </div>

            <div class="field-grid">
              <div>
                <label class="field-label">默认模型</label>
                <select
                  v-model="form.model"
                  class="text-input"
                  :disabled="modelsDisabled"
                >
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">
                    {{ m.label }} ({{ m.id }})
                  </option>
                </select>
              </div>
              <div>
                <label class="field-label">轻量模型（small_model）</label>
                <select
                  v-model="form.smallModel"
                  class="text-input"
                  :disabled="modelsDisabled"
                >
                  <option v-for="m in smallModelOptions" :key="m.id" :value="m.id">
                    {{ m.label }} ({{ m.id }})
                  </option>
                </select>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="hint-line">
              使用你自己的 OpenAI 兼容接口（含自备 DeepSeek 等）。请求不经过公司网关计费。可在
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.deepseek)"
              >
                DeepSeek 开放平台
              </button>
              自备 Key 后填写下方 Base URL。
            </p>

            <label class="field-label">API Key</label>
            <div class="input-row">
              <input
                v-model="form.apiKey"
                class="text-input"
                :type="showApiKey ? 'text' : 'password'"
                :placeholder="snapshot?.apiKeySet ? '已配置（修改则覆盖）' : '粘贴 API Key'"
                autocomplete="off"
              />
              <button type="button" class="icon-btn" @click="showApiKey = !showApiKey">
                <Icon :name="showApiKey ? 'eye' : 'eye-off'" :size="14" />
              </button>
            </div>

            <label class="field-label">Base URL</label>
            <input
              v-model="form.baseUrl"
              class="text-input"
              placeholder="https://api.deepseek.com/v1"
              autocomplete="off"
            />

            <div class="field-grid">
              <div>
                <label class="field-label">默认模型 ID</label>
                <input
                  v-model="form.customModelId"
                  class="text-input"
                  placeholder="如 deepseek-v4-pro"
                  autocomplete="off"
                />
              </div>
              <div>
                <label class="field-label">轻量模型 ID</label>
                <input
                  v-model="form.customSmallModelId"
                  class="text-input"
                  placeholder="如 deepseek-v4-flash"
                  autocomplete="off"
                />
              </div>
            </div>

            <label class="settings-checkbox">
              <input v-model="form.customModelSupportsImage" type="checkbox" />
              <span>
                默认/轻量模型支持读图（多模态）
                <span class="muted">勾选后 OpenCode 才允许 Read 图片；请确认上游模型具备视觉能力</span>
              </span>
            </label>
          </template>

          <div class="active-banner">
            <Icon name="info" :size="14" />
            <span>
              当前
              <code>{{
                isCustom
                  ? `自定义 · ${form.customModelId || '…'}`
                  : `官方 · ${form.model}`
              }}</code>
              · 保存后自动重启 OpenCode
            </span>
          </div>
        </section>

        <hr class="settings-divider" />

        <!-- 搜索 -->
        <section id="settings-search" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>搜索服务</h3>
              <button
                v-if="isCustom"
                type="button"
                class="help-link-btn"
                title="什么是 Tavily？为什么需要搜索 Key？"
                aria-label="什么是 Tavily？为什么需要搜索 Key？"
                @click="openProductLink(PRODUCT_LINKS.docsFaqSearch)"
              >
                <Icon name="help-circle" :size="14" />
              </button>
            </div>
            <span class="muted mono">workspace/.env · SEARCH_*</span>
          </div>

          <template v-if="isOfficial">
            <p class="hint-line">
              <Icon name="info" :size="12" />
              官方通道下搜索由官方提供，无需单独配置，费用从账户余额扣除。
            </p>
            <div class="field-grid">
              <div>
                <label class="field-label">搜索提供商</label>
                <input class="text-input" value="官方通道（Token 网关）" disabled />
              </div>
              <div>
                <label class="field-label">计费方式</label>
                <input class="text-input" value="按账户余额计费" disabled />
              </div>
            </div>
            <label class="field-label">TAVILY_API_KEY</label>
            <div class="input-row">
              <input
                class="text-input"
                type="password"
                value=""
                placeholder="官方通道下无需配置"
                disabled
                autocomplete="off"
              />
            </div>
          </template>

          <template v-else>
            <div class="field-grid">
              <div>
                <label class="field-label">搜索提供商</label>
                <select v-model="form.searchProvider" class="text-input">
                  <option value="tavily">Tavily</option>
                </select>
              </div>
              <div>
                <label class="field-label">日限额 SEARCH_DAILY_LIMIT</label>
                <input
                  v-model.number="form.searchDailyLimit"
                  class="text-input"
                  type="number"
                  min="1"
                  max="10000"
                />
              </div>
            </div>

            <label class="field-label">TAVILY_API_KEY</label>
            <div class="input-row">
              <input
                v-model="form.tavilyApiKey"
                class="text-input"
                :type="showTavilyKey ? 'text' : 'password'"
                :placeholder="snapshot?.tavilyApiKeySet ? '已配置（修改则覆盖）' : 'tvly-…'"
                autocomplete="off"
              />
              <button type="button" class="icon-btn" @click="showTavilyKey = !showTavilyKey">
                <Icon :name="showTavilyKey ? 'eye' : 'eye-off'" :size="14" />
              </button>
            </div>
            <p class="hint-line">
              自定义通道需自备 Tavily Key（不经官方余额）。免费用户每月约 1000 次调用。前往
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.tavily)"
              >
                Tavily 官网
              </button>
              注册并获取 API Key。
            </p>

            <div class="usage-row">
              <span class="mono">
                今日用量 {{ snapshot?.searchUsedToday ?? 0 }} / {{ form.searchDailyLimit }}
              </span>
              <div class="usage-bar">
                <i :style="{ width: `${usagePct}%` }" />
              </div>
              <span class="mono muted">{{ usagePct }}%</span>
            </div>
          </template>
        </section>

        <hr class="settings-divider" />

        <!-- 探索 -->
        <section id="settings-explore" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>探索强度</h3>
              <span class="muted mono">exploreIntensity</span>
            </div>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            更高会多出关键词、每次搜索与地图结果更多，耗时和费用更高。改档后需再次「扩展关键词」才影响词表；不会改已经生成的词。切换后立即生效，不必点上方「保存配置」。
          </p>
          <div class="theme-mode-row">
            <label
              v-for="opt in EXPLORE_INTENSITY_OPTIONS"
              :key="opt.id"
              class="theme-mode-option"
              :class="{ 'is-active': form.exploreIntensity === opt.id }"
            >
              <input
                v-model="form.exploreIntensity"
                type="radio"
                name="exploreIntensity"
                :value="opt.id"
                @change="onExploreIntensityChange"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
          <p class="hint-line muted">{{ exploreIntensitySummary }}</p>

          <hr class="settings-divider settings-divider--inner" />

          <div class="settings-block__title" style="margin-top: 8px">
            <h3>R2 社媒站点</h3>
            <span class="muted mono">data/prefs/explore-r2.json</span>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            选择 R2 社媒发现要去哪些站点出词。勾选后立即保存，不必点上方「保存配置」。下次生成关键词时生效，不会改已经生成的词。
          </p>
          <div v-if="r2Sites.length" class="settings-r2-sites">
            <label
              v-for="site in r2Sites"
              :key="site.id"
              class="settings-r2-sites__item"
            >
              <input
                type="checkbox"
                :checked="site.enabled"
                @change="onR2SiteToggle(site.id, $event)"
              />
              <span>
                <strong>{{ site.label }}</strong>
                <span class="muted mono"> {{ site.include_domains.join(', ') }}</span>
              </span>
            </label>
          </div>
          <p v-else class="hint-line">暂无站点登记表，将使用默认的 LinkedIn 公司页与 Facebook 公共主页。</p>
          <p v-if="r2SitesHint" class="hint-line">{{ r2SitesHint }}</p>

          <div class="settings-block__sub">
            <h4>R3 地图发现（Google Places）</h4>
            <p class="hint-line">
              <Icon name="info" :size="12" />
              仅在跑 R3 地图发现时需要；只跑 R1/R2 可不填。Key 在
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.googleCloudCredentials)"
              >
                Google Cloud Console
              </button>
              创建，须启用 <strong>Places API (New)</strong>；费用计入你的 GCP 结算账号。
              申请步骤见
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.docsPlacesApiKey)"
              >
                帮助文档
              </button>
              。
            </p>
            <p class="hint-line">
              Places 请求由<strong>本机</strong>直连 Google 服务（不经 FTCS 服务器）。你须在
              <strong>合法合规、可访问 Google 服务</strong>的网络环境中使用，并遵守当地法规与
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.googlePlacesPolicies)"
              >
                Google Places 政策
              </button>
              。
            </p>
            <label class="field-label">Google Places API Key</label>
            <div class="input-row">
              <input
                v-model="form.placesApiKey"
                class="text-input"
                :type="showPlacesKey ? 'text' : 'password'"
                autocomplete="off"
                :placeholder="snapshot?.placesApiKeySet ? '已配置（修改则覆盖；留空并保存可清除）' : 'AIza…'"
              />
              <button type="button" class="icon-btn" @click="showPlacesKey = !showPlacesKey">
                <Icon :name="showPlacesKey ? 'eye' : 'eye-off'" :size="14" />
              </button>
            </div>
            <p class="hint-line muted">
              与模型 / Tavily 搜索通道独立；保存后请重启 OpenCode 使 MCP 生效。
            </p>

            <label class="field-label">Google 出站代理（R3 专用）</label>
            <p class="hint-line">
              使用 Clash 等<strong>系统代理</strong>但未开 TUN 时，选「跟随系统代理」；也可手动填
              <code>http://127.0.0.1:7890</code> 或 SOCKS5 地址。仅影响 Places 请求，不改 Tavily。
            </p>
            <div class="provider-row">
              <button
                type="button"
                class="provider-chip"
                :class="{ 'is-active': form.googleProxyMode === 'system' }"
                @click="form.googleProxyMode = 'system'"
              >
                跟随系统代理
              </button>
              <button
                type="button"
                class="provider-chip"
                :class="{ 'is-active': form.googleProxyMode === 'manual' }"
                @click="form.googleProxyMode = 'manual'"
              >
                手动指定
              </button>
              <button
                type="button"
                class="provider-chip"
                :class="{ 'is-active': form.googleProxyMode === 'off' }"
                @click="form.googleProxyMode = 'off'"
              >
                直连
              </button>
            </div>
            <div v-if="form.googleProxyMode === 'manual'" class="input-row">
              <input
                v-model="form.googleProxyManualUrl"
                class="text-input"
                type="text"
                autocomplete="off"
                placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7891"
              />
            </div>
            <p
              v-if="snapshot?.googleProxyEffectiveUrl"
              class="hint-line muted"
            >
              当前生效代理：{{ snapshot.googleProxyEffectiveUrl }}
            </p>
            <div class="settings-actions-row">
              <button
                type="button"
                class="btn-secondary btn-sm"
                :disabled="detectingProxy || saving"
                @click="onDetectGoogleProxy"
              >
                {{ detectingProxy ? '检测中…' : '检测系统代理' }}
              </button>
              <button
                type="button"
                class="btn-secondary btn-sm"
                :disabled="testingPlaces || saving"
                @click="onTestGooglePlaces"
              >
                {{ testingPlaces ? '测试中…' : '测试 Google 连接' }}
              </button>
            </div>
            <p v-if="proxyDetectMessage" class="hint-line">{{ proxyDetectMessage }}</p>
            <p
              v-if="placesTestMessage"
              class="hint-line"
              :class="placesTestOk ? 'is-ok' : 'is-error'"
            >
              {{ placesTestMessage }}
            </p>
          </div>
        </section>

        <hr class="settings-divider" />

        <!-- 集成 -->
        <section id="settings-integrations" class="settings-block">
          <div class="settings-block__head">
            <h3>集成</h3>
            <span class="muted mono">HUNTER_API_KEYS / HUNTER_VERIFY_EMAILS</span>
          </div>
          <div class="settings-block__sub">
            <h4>Hunter · 补全联系人</h4>
            <p class="hint-line">
              <Icon name="info" :size="12" />
              可选扩展：仅「补全联系人」需要；未配置不影响探索与开发信。Key 在
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.hunterApiKeys)"
              >
                Hunter API Keys
              </button>
              创建；费用计入你的 Hunter 账号。
            </p>
            <p class="hint-line">
              最多 <strong>{{ HUNTER_KEYS_MAX }}</strong> 个 Key，每格一个；可单独删除。系统按顺序使用，额度用尽或无效时自动切换下一个。
              <strong>Hunter 额度为账号级</strong>：同一账号下多个 Key 共享额度。请仅配置本人/团队合法持有的 Key。
            </p>
            <label class="field-label">
              Hunter API Key
              <span v-if="snapshot?.hunterApiKeyCount" class="muted">
                （已配置 {{ snapshot.hunterApiKeyCount }} 个）
              </span>
              <button
                type="button"
                class="icon-btn"
                style="margin-left: 4px; vertical-align: middle"
                :title="showHunterKeys ? '隐藏' : '显示'"
                @click="showHunterKeys = !showHunterKeys"
              >
                <Icon :name="showHunterKeys ? 'eye' : 'eye-off'" :size="14" />
              </button>
            </label>
            <div class="settings-hunter-keys">
              <div
                v-for="(_, index) in hunterKeySlots"
                :key="index"
                class="input-row settings-hunter-keys__row"
              >
                <input
                  v-model="hunterKeySlots[index]"
                  class="text-input"
                  :type="showHunterKeys ? 'text' : 'password'"
                  autocomplete="off"
                  :placeholder="`Key ${index + 1}`"
                  :aria-label="`Hunter API Key ${index + 1}`"
                />
                <button
                  type="button"
                  class="icon-btn"
                  title="删除此 Key"
                  :disabled="hunterKeySlots.length === 1 && !hunterKeySlots[0]"
                  @click="removeHunterKeySlot(index)"
                >
                  <Icon name="trash" :size="14" />
                </button>
              </div>
              <button
                v-if="hunterKeySlots.length < HUNTER_KEYS_MAX"
                type="button"
                class="btn-secondary btn-sm"
                @click="addHunterKeySlot"
              >
                <Icon name="plus" :size="12" />
                添加 Key
              </button>
            </div>
            <label class="settings-checkbox">
              <input v-model="form.hunterVerifyEmails" type="checkbox" />
              <span>
                补全联系人时验证邮箱
                <span class="muted">
                  Domain Search 约 1 credit/次；验邮约 0.5 credit/封。默认开启，一次配置全局生效。
                </span>
              </span>
            </label>
            <p class="hint-line muted">
              保存后请重启 OpenCode 使 MCP 生效。
              尚未注册？
              <button
                type="button"
                class="text-link-btn"
                @click="openProductLink(PRODUCT_LINKS.hunter)"
              >
                打开 Hunter
              </button>
            </p>
            <div class="input-row" style="margin-top: 0.5rem">
              <button
                type="button"
                class="btn-secondary"
                :disabled="testingHunter || saving"
                @click="onTestHunter"
              >
                {{ testingHunter ? '测试中…' : '测试连接' }}
              </button>
            </div>
            <p
              v-if="hunterTestMessage"
              class="hint-line"
              :class="hunterTestOk ? 'is-ok' : 'is-error'"
            >
              {{ hunterTestMessage }}
            </p>
          </div>
        </section>

        <hr class="settings-divider" />

        <!-- 开发信 -->
        <section id="settings-outreach" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>开发信行文风格</h3>
              <span class="muted mono">emailDraftStylePrompt</span>
            </div>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            用自然语言描述期望语气。默认「专业，真诚」。修改后不会自动重写已有草稿，仅影响之后的起草与重写。
          </p>
          <textarea
            v-model="form.emailDraftStylePrompt"
            class="text-input"
            rows="5"
            placeholder="例：简洁、少套话；偏顾问语气，强调 OEM 与交期；活泼但专业，避免过度热情。"
          />
          <div class="settings-actions-row">
            <p class="muted">
              作用域：本机全局 · 跨产品 · {{ emailStyleCharCount }}/{{
                EMAIL_DRAFT_STYLE_PROMPT_MAX
              }} 字
            </p>
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="
                form.emailDraftStylePrompt.trim() ===
                DEFAULT_EMAIL_DRAFT_STYLE_PROMPT
              "
              @click="form.emailDraftStylePrompt = DEFAULT_EMAIL_DRAFT_STYLE_PROMPT"
            >
              恢复默认
            </button>
          </div>
          <p class="hint-line muted">
            不做正式/简洁/友好等预设；由大模型理解自然语言并落实到主题与正文。
          </p>
        </section>

        <hr class="settings-divider" />

        <!-- 外观 -->
        <section id="settings-appearance" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>界面主题</h3>
              <span class="muted mono">uiThemeMode</span>
            </div>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            选择暗黑、日间或跟随 Windows 系统外观。标题栏按钮在当前画面的日间和暗黑之间一键切换。切换后立即生效并记住本机偏好。
          </p>
          <div class="theme-mode-row">
            <label
              v-for="opt in [
                { id: 'dark', label: '暗黑' },
                { id: 'light', label: '日间' },
                { id: 'system', label: '跟随系统' },
              ]"
              :key="opt.id"
              class="theme-mode-option"
              :class="{ 'is-active': form.uiThemeMode === opt.id }"
            >
              <input
                v-model="form.uiThemeMode"
                type="radio"
                name="uiThemeMode"
                :value="opt.id"
                @change="onUiThemeChange"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </section>

        <hr class="settings-divider" />

        <!-- 启动与托盘 -->
        <section id="settings-startup" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>开机自启</h3>
              <span class="muted mono">openAtLogin</span>
            </div>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            登录 Windows 后自动启动（可先藏托盘、不抢前台）。系统「设置 → 应用 → 启动」可能拦截。勾选后立即生效。
          </p>
          <label class="settings-checkbox">
            <input
              v-model="form.openAtLogin"
              type="checkbox"
              @change="onOpenAtLoginChange"
            />
            <span>开机时自动启动外贸获客</span>
          </label>

          <hr class="settings-divider settings-divider--inner" />

          <div class="settings-block__title" style="margin-top: 8px">
            <h3>关闭窗口行为</h3>
            <span class="muted mono">closeToTrayEnabled</span>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            开启后，点窗口「×」会隐藏到系统托盘（进程继续跑，便于定时任务）；完全退出请用托盘菜单「退出」。默认关闭；需要定时任务时可在线索页一键开启。勾选后立即生效。
          </p>
          <label class="settings-checkbox">
            <input
              v-model="form.closeToTrayEnabled"
              type="checkbox"
              @change="onCloseToTrayChange"
            />
            <span>关闭窗口时最小化到托盘</span>
          </label>
        </section>

        <hr class="settings-divider" />

        <!-- 通知 -->
        <section id="settings-notifications" class="settings-block">
          <div class="settings-block__head">
            <div class="settings-block__title">
              <h3>任务完成通知</h3>
              <span class="muted mono">taskDoneNotificationEnabled</span>
            </div>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            长任务结束且窗口不在前台时，弹出 Windows 系统通知。可在系统「通知和操作」中管理权限。
          </p>
          <label class="settings-checkbox">
            <input v-model="form.taskDoneNotificationEnabled" type="checkbox" />
            <span>启用任务完成通知</span>
          </label>
          <p class="hint-line muted">
            作用域：本机全局 · 默认开启 · 标题为「FTCS·外贸获客智能体」
          </p>
        </section>

        <hr class="settings-divider" />

        <!-- 工作区 -->
        <section id="settings-workspace" class="settings-block">
          <div class="settings-block__head">
            <h3>工作区</h3>
            <span class="muted mono">FTCS_WORKSPACE</span>
          </div>
          <div class="input-row">
            <input
              class="text-input"
              :value="snapshot?.workspaceRoot ?? '—'"
              readonly
            />
            <button type="button" class="btn-secondary" @click="onPickWorkspace">更改…</button>
          </div>
          <p class="hint-line">
            <Icon name="info" :size="12" />
            包含 skills / mcp-servers / config / data · 切换后会重启 OpenCode
          </p>
        </section>

        <hr class="settings-divider" />

        <!-- OpenCode -->
        <section id="settings-opencode" class="settings-block">
          <div class="settings-block__head">
            <h3>OpenCode 运行时</h3>
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="loading"
              @click="restartOpenCode"
            >
              {{ loading ? '重启中…' : '重启' }}
            </button>
          </div>

          <div class="oc-banner" :class="{ 'is-ready': runtimeHealthy }">
            <i class="oc-status__dot" />
            <div>
              <div>{{ runtimeLabel }}</div>
              <div class="mono muted">
                {{ status?.opencode?.baseUrl ?? '—' }}
                · v{{ status?.opencode?.version ?? '—' }}
              </div>
            </div>
          </div>

          <label class="field-label">MCP 服务</label>
          <ul v-if="status?.mcpServers?.length" class="mcp-list">
            <li v-for="item in status.mcpServers" :key="item.name">
              <span class="mono">{{ item.name }}</span>
              <span class="mcp-badge" :class="{ ok: item.status === 'connected' }">
                {{ item.status }}
              </span>
              <span v-if="item.error" class="muted mcp-error" :title="item.error">
                {{ item.error }}
              </span>
            </li>
          </ul>
          <p v-else class="muted">OpenCode 未就绪或 MCP 尚未连接</p>
        </section>

        <hr class="settings-divider" />

        <!-- 关于 -->
        <section id="settings-about" class="settings-block">
          <h3>关于与隐私</h3>
          <div class="about-row">
            <span class="muted">应用</span>
            <span class="mono">FTCS Desktop {{ appVersion || '—' }}</span>
          </div>
          <div class="about-row">
            <span class="muted">架构</span>
            <span class="mono">Electron + Vue3 + OpenCode SDK</span>
          </div>
          <div class="about-row">
            <span class="muted">用户偏好</span>
            <span class="mono">{{ snapshot?.envPath ?? '—' }}</span>
          </div>
          <div class="about-row">
            <span class="muted">OpenCode 模板</span>
            <span class="mono">{{ snapshot?.opencodeConfigPath ?? '—' }}</span>
          </div>

          <label class="field-label">软件更新</label>
          <div class="settings-actions-row">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="updateChecking"
              @click="onCheckUpdate"
            >
              <Icon name="refresh-cw" :size="12" />
              {{ updateChecking ? '检查中…' : '检查更新' }}
            </button>
            <button
              v-if="updateResult.hasUpdate"
              type="button"
              class="btn-primary btn-sm"
              @click="openDownloadPage"
            >
              前往下载页
            </button>
          </div>
          <p v-if="updateHint" class="hint-line">{{ updateHint }}</p>
          <p class="hint-line mono">清单：{{ PRODUCT_LINKS.updateManifest }}</p>

          <label class="field-label">首次引导</label>
          <div class="settings-actions-row">
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="reopenOnboarding('env')"
            >
              <Icon name="play" :size="12" />
              打开环境与配置引导
            </button>
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="reopenOnboarding('tour')"
            >
              <Icon name="sparkles" :size="12" />
              打开业务引导
            </button>
          </div>
          <p class="hint-line">用于检测 Node / OpenCode / Chrome，以及可选的 OfficeCLI（Word/Excel/PPT 抽文本）；并引导配置密钥与主流程。Windows 上可在引导中一键安装 Node.js、OpenCode 与 OfficeCLI（OpenCode 需先就绪 Node，装完需重启；OfficeCLI 装完无需重启）。</p>

          <label class="field-label">官网与帮助</label>
          <div class="settings-actions-row">
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="openProductLink(PRODUCT_LINKS.website)"
            >
              <Icon name="globe" :size="12" />
              打开官网
            </button>
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="openProductLink(PRODUCT_LINKS.docs)"
            >
              <Icon name="file-text" :size="12" />
              帮助文档
            </button>
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="openProductLink(PRODUCT_LINKS.download)"
            >
              <Icon name="package" :size="12" />
              下载页
            </button>
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="openChangelogPage"
            >
              <Icon name="file-text" :size="12" />
              发布日志
            </button>
            <button type="button" class="btn-secondary btn-sm" @click="onShareApp">
              <Icon name="share-2" :size="12" />
              分享应用
            </button>
          </div>
          <p class="hint-line mono">{{ PRODUCT_LINKS.download }}</p>
          <p v-if="shareHint" class="hint-line">{{ shareHint }}</p>

          <p class="settings-foot">
            <Icon name="info" :size="14" />
            API Key 与模型偏好均写入本地 workspace/.env；opencode.json 由模板托管，同步不会覆盖你的设置。
          </p>
        </section>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmLogout"
      title="退出登录？"
      message="退出后本地工作区数据仍保留，意见反馈等账号功能将不可用。"
      confirm-label="退出"
      danger
      :busy="authBusy"
      @confirm="onAuthLogout"
      @cancel="confirmLogout = false"
    />
    <ConfirmDialog
      :open="confirmResetGateway"
      title="重置网关凭证？"
      message="将重新签发网关 Key，本机及其它设备上的旧凭证立即失效。是否继续？"
      confirm-label="重置"
      danger
      :busy="provisioning"
      @confirm="onProvisionOfficial(true)"
      @cancel="confirmResetGateway = false"
    />
  </section>
</template>
