<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Icon from '../components/shared/Icon.vue'
import { useAppStatus } from '../composables/useAppStatus'
import { useAuth } from '../composables/useAuth'
import { useSettingsNav } from '../composables/useSettingsNav'
import { SECTION_META } from '../types/workspace'
import type { ChannelMode, SettingsSnapshot } from '../types/settings'
import { OFFICIAL_MODEL_CATALOG } from '../types/settings'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { PRODUCT_LINKS } from '../config/links'
import { shareAppDownload } from '../composables/useShareApp'
import { useOnboarding } from '../composables/useOnboarding'
import { useUpdateCheck } from '../composables/useUpdateCheck'

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
const showApiKey = ref(false)
const showTavilyKey = ref(false)
const snapshot = ref<SettingsSnapshot | null>(null)

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
  searchDailyLimit: 50,
})

const channels: Array<{ id: ChannelMode; label: string }> = [
  { id: 'official', label: '官方通道' },
  { id: 'custom', label: '自定义' },
]

const categories: Array<{ id: typeof activeCategory.value; label: string }> = [
  { id: 'account', label: '账号与授权' },
  { id: 'model', label: '模型通道' },
  { id: 'search', label: '搜索服务' },
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

function applySnapshot(data: SettingsSnapshot): void {
  snapshot.value = data
  form.channelMode = data.channelMode
  form.apiKey = data.apiKeyMasked
  form.baseUrl = data.baseUrl
  form.model = data.model
  form.smallModel = data.smallModel
  form.searchProvider = data.searchProvider
  form.tavilyApiKey = data.tavilyApiKeyMasked
  form.searchDailyLimit = data.searchDailyLimit
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
      searchDailyLimit: form.searchDailyLimit,
    })
    applySnapshot(result.settings)
    message.value = result.message
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onReset(): Promise<void> {
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

onMounted(() => {
  void loadSettings()
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
        <button type="button" class="btn-secondary" :disabled="saving || loading" @click="onReset">
          重置
        </button>
        <button type="button" class="btn-primary" :disabled="saving || loading" @click="onSave">
          <Icon name="save" :size="12" />
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </header>

    <p v-if="message" class="settings-banner is-ok">{{ message }}</p>
    <p v-if="error" class="settings-banner is-err">{{ error }}</p>

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
              经公司 Token 网关调用 DeepSeek，费用从账户余额扣除；无需自备上游 API Key。
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
              官方通道下免费提供搜索服务，无需单独配置。
            </p>
            <div class="field-grid">
              <div>
                <label class="field-label">搜索提供商</label>
                <input class="text-input" value="官方通道（Token 网关）" disabled />
              </div>
              <div>
                <label class="field-label">计费方式</label>
                <input class="text-input" value="官方免费提供" disabled />
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
