<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import { useOnboarding } from '../../composables/useOnboarding'
import { PRODUCT_LINKS } from '../../config/links'
import {
  OFFICIAL_MODEL_CATALOG,
  type ChannelMode,
  type SettingsSnapshot,
} from '../../types/settings'
import { TOUR_STEPS } from '../../types/onboarding'
import type {
  EnvProbeItem,
  NodeInstallResult,
  OfficeCliInstallResult,
  OpenCodeInstallResult,
} from '../../types/onboarding'
import Icon from '../shared/Icon.vue'

const router = useRouter()
const {
  open,
  phase,
  tourStep,
  probe,
  probing,
  busy,
  error,
  envOk,
  bootstrapOnboarding,
  skipAll,
  goPhase,
  completeAll,
  setTourStep,
  runProbe,
  persist,
} = useOnboarding()
const {
  loggedIn,
  loginPending,
  busy: authBusy,
  login,
} = useAuth()

const savingKeys = ref(false)
const provisioning = ref(false)
const keysMessage = ref('')
const keysError = ref('')
const authHint = ref('')
const showApiKey = ref(false)
const showTavilyKey = ref(false)
const showPlacesKey = ref(false)
const snapshot = ref<SettingsSnapshot | null>(null)
const installingNode = ref(false)
const nodeInstallProgress = ref('')
const nodeInstallResult = ref<NodeInstallResult | null>(null)
let stopNodeProgress: (() => void) | null = null
const installingOpenCode = ref(false)
const openCodeInstallProgress = ref('')
const openCodeInstallResult = ref<OpenCodeInstallResult | null>(null)
let stopOpenCodeProgress: (() => void) | null = null
const installingOfficeCli = ref(false)
const officeCliInstallProgress = ref('')
const officeCliInstallResult = ref<OfficeCliInstallResult | null>(null)
let stopOfficeCliProgress: (() => void) | null = null

const anyRuntimeInstalling = computed(
  () =>
    installingNode.value ||
    installingOpenCode.value ||
    installingOfficeCli.value,
)

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
  searchDailyLimit: 50,
  customModelSupportsImage: false,
})

const channels: Array<{ id: ChannelMode; label: string }> = [
  { id: 'official', label: '官方通道' },
  { id: 'custom', label: '自定义' },
]

const phases = [
  { id: 'env' as const, label: '1  环境监测' },
  { id: 'keys' as const, label: '2  模型通道' },
  { id: 'tour' as const, label: '3  业务引导' },
]

const isOfficial = computed(() => form.channelMode === 'official')
const officialNeedsLogin = computed(() => isOfficial.value && !loggedIn.value)
const officialNeedsProvision = computed(
  () => isOfficial.value && loggedIn.value && !snapshot.value?.officialProvisioned,
)
const modelsDisabled = computed(
  () => isOfficial.value && !snapshot.value?.officialProvisioned,
)
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
const currentTour = computed(() => TOUR_STEPS[tourStep.value] ?? TOUR_STEPS[0])

const header = computed(() => {
  if (phase.value === 'keys') {
    return {
      eyebrow: 'FTCS 首次设置 · 步骤 2 / 3',
      title: '选择模型通道并配置密钥',
      subtitle:
        '写入本地 workspace/.env，不会上传。搜索 Key 用于 R1/R2；Places Key 可选，仅 R3 地图发现需要。',
    }
  }
  if (phase.value === 'tour') {
    return {
      eyebrow: 'FTCS 首次设置 · 步骤 3 / 3',
      title: '走一遍获客主流程',
      subtitle:
        '不必一次做完。点选步骤可跳到对应页面；也可先结束引导，稍后在设置中重新打开。',
    }
  }
  return {
    eyebrow: 'FTCS 首次设置 · 步骤 1 / 3',
    title: '先检查运行环境',
    subtitle:
      '安装包保持轻量，以下依赖需本机就绪。请先就绪 Node.js，再一键安装 OpenCode；装成功后请退出并重启应用，再点重新检测。另有 OfficeCLI（可选）：仅当资料含 Word / Excel / PPT 时需要，可稍后安装。',
  }
})

function statusLabel(item: EnvProbeItem): string {
  if (item.status === 'ok') return '就绪'
  if (item.status === 'outdated') return '过旧'
  if (item.status === 'error') return '异常'
  return '缺失'
}

function canOneClickInstallNode(item: EnvProbeItem): boolean {
  return (
    item.id === 'node' &&
    item.status !== 'ok' &&
    Boolean(window.ftcs?.installNode) &&
    window.ftcs?.platform === 'win32'
  )
}

function canReinstallNode(item: EnvProbeItem): boolean {
  if (item.id !== 'node' || item.status !== 'ok') return false
  if (!window.ftcs?.installNode || window.ftcs?.platform !== 'win32') return false
  return (
    item.detail.includes('node-runtime') || item.detail.includes('prefs.nodePath')
  )
}

function canOneClickInstallOpenCode(item: EnvProbeItem): boolean {
  return (
    item.id === 'opencode' &&
    item.status !== 'ok' &&
    Boolean(window.ftcs?.installOpenCode) &&
    window.ftcs?.platform === 'win32'
  )
}

function canReinstallOpenCode(item: EnvProbeItem): boolean {
  if (item.id !== 'opencode' || item.status !== 'ok') return false
  if (!window.ftcs?.installOpenCode || window.ftcs?.platform !== 'win32') return false
  return (
    item.detail.includes('opencode-runtime') ||
    item.detail.includes('prefs.opencodePath')
  )
}

function canOneClickInstallOfficeCli(item: EnvProbeItem): boolean {
  return (
    item.id === 'officecli' &&
    item.status !== 'ok' &&
    Boolean(window.ftcs?.installOfficeCli) &&
    window.ftcs?.platform === 'win32'
  )
}

function canReinstallOfficeCli(item: EnvProbeItem): boolean {
  return (
    item.id === 'officecli' &&
    item.status === 'ok' &&
    Boolean(window.ftcs?.installOfficeCli) &&
    window.ftcs?.platform === 'win32'
  )
}

async function openExternal(url: string): Promise<void> {
  if (!window.ftcs?.openExternal || !url) return
  await window.ftcs.openExternal(url)
}

async function onInstallNode(forceReinstall = false): Promise<void> {
  if (!window.ftcs?.installNode || anyRuntimeInstalling.value) return
  installingNode.value = true
  nodeInstallProgress.value = forceReinstall ? '准备重新安装…' : '准备下载…'
  nodeInstallResult.value = null
  openCodeInstallResult.value = null
  officeCliInstallResult.value = null
  error.value = ''
  stopNodeProgress?.()
  stopNodeProgress = window.ftcs.onNodeInstallProgress?.((p) => {
    nodeInstallProgress.value = p.message
  }) ?? null
  try {
    const result = await window.ftcs.installNode(
      forceReinstall ? { forceReinstall: true } : undefined,
    )
    nodeInstallResult.value = result
    if (!result.ok) {
      error.value = result.message
      nodeInstallProgress.value = ''
    } else {
      nodeInstallProgress.value = ''
      await runProbe()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    nodeInstallProgress.value = ''
  } finally {
    stopNodeProgress?.()
    stopNodeProgress = null
    installingNode.value = false
  }
}

async function onInstallOpenCode(forceReinstall = false): Promise<void> {
  if (!window.ftcs?.installOpenCode || anyRuntimeInstalling.value) return
  installingOpenCode.value = true
  openCodeInstallProgress.value = forceReinstall ? '准备重新准备…' : '准备下载…'
  openCodeInstallResult.value = null
  nodeInstallResult.value = null
  officeCliInstallResult.value = null
  error.value = ''
  stopOpenCodeProgress?.()
  stopOpenCodeProgress =
    window.ftcs.onOpenCodeInstallProgress?.((p) => {
      openCodeInstallProgress.value = p.message
    }) ?? null
  try {
    const result = await window.ftcs.installOpenCode(
      forceReinstall ? { forceReinstall: true } : undefined,
    )
    openCodeInstallResult.value = result
    if (!result.ok) {
      error.value = result.message
      openCodeInstallProgress.value = ''
    } else {
      openCodeInstallProgress.value = ''
      await runProbe()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    openCodeInstallProgress.value = ''
  } finally {
    stopOpenCodeProgress?.()
    stopOpenCodeProgress = null
    installingOpenCode.value = false
  }
}

async function onInstallOfficeCli(): Promise<void> {
  if (!window.ftcs?.installOfficeCli || anyRuntimeInstalling.value) return
  installingOfficeCli.value = true
  officeCliInstallProgress.value = '准备安装…'
  officeCliInstallResult.value = null
  nodeInstallResult.value = null
  openCodeInstallResult.value = null
  error.value = ''
  stopOfficeCliProgress?.()
  stopOfficeCliProgress =
    window.ftcs.onOfficeCliInstallProgress?.((p) => {
      officeCliInstallProgress.value = p.message
    }) ?? null
  try {
    const result = await window.ftcs.installOfficeCli()
    officeCliInstallResult.value = result
    if (!result.ok) {
      error.value = result.message
      officeCliInstallProgress.value = ''
    } else {
      officeCliInstallProgress.value = ''
      await runProbe()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    officeCliInstallProgress.value = ''
  } finally {
    stopOfficeCliProgress?.()
    stopOfficeCliProgress = null
    installingOfficeCli.value = false
  }
}

async function onQuitApp(): Promise<void> {
  if (!window.ftcs?.quitApp) return
  await window.ftcs.quitApp()
}

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
  form.searchDailyLimit = data.searchDailyLimit
  form.customModelSupportsImage = data.customModelSupportsImage
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
  if (!window.ftcs?.getSettings) return
  try {
    applySnapshot(await window.ftcs.getSettings())
    keysError.value = ''
    if (
      form.channelMode === 'official' &&
      snapshot.value?.officialProvisioned &&
      window.ftcs.refreshOfficialModels
    ) {
      const res = await window.ftcs.refreshOfficialModels()
      applySnapshot(res.settings)
    }
  } catch (err) {
    keysError.value = err instanceof Error ? err.message : String(err)
  }
}

async function onAuthLogin(): Promise<void> {
  authHint.value = '正在打开浏览器…'
  const res = await login()
  authHint.value = res.message
}

async function onProvisionOfficial(): Promise<void> {
  if (!window.ftcs?.provisionOfficialChannel) return
  provisioning.value = true
  keysMessage.value = '正在开通官方通道…'
  keysError.value = ''
  try {
    const res = await window.ftcs.provisionOfficialChannel({ reset: false })
    applySnapshot(res.settings)
    if (res.ok) {
      keysMessage.value = res.message
    } else {
      keysMessage.value = ''
      keysError.value = res.message
      if (res.needLogin) authHint.value = '请先登录'
    }
  } catch (err) {
    keysMessage.value = ''
    keysError.value = err instanceof Error ? err.message : String(err)
  } finally {
    provisioning.value = false
  }
}

async function onSaveKeys(andContinue: boolean): Promise<void> {
  if (!window.ftcs?.saveSettings) return
  if (officialNeedsLogin.value) {
    keysError.value = '官方通道需要先登录。请点击「去登录」。'
    return
  }
  if (officialNeedsProvision.value) {
    keysError.value = '请先开通官方通道。'
    return
  }
  savingKeys.value = true
  keysMessage.value = ''
  keysError.value = ''
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
      searchDailyLimit: form.searchDailyLimit,
      customModelSupportsImage: form.customModelSupportsImage,
    })
    applySnapshot(result.settings)
    keysMessage.value = result.message
    if (andContinue) await goPhase('tour')
  } catch (err) {
    keysError.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingKeys.value = false
  }
}

async function onEnvContinue(): Promise<void> {
  await goPhase('keys')
  await loadSettings()
}

async function onOpenTourPage(): Promise<void> {
  const step = currentTour.value
  open.value = false
  await persist({ phase: 'tour', tourStep: tourStep.value })
  await router.push({ name: step.route })
}

async function onFinishTour(): Promise<void> {
  await completeAll()
}

watch(phase, async (p) => {
  if (p === 'keys' && open.value) await loadSettings()
})

watch(
  () => form.channelMode,
  (mode) => {
    if (mode === 'official') {
      form.searchProvider = 'gateway'
      if (!OFFICIAL_MODEL_CATALOG.models.some((m) => m.id === form.model)) {
        form.model = OFFICIAL_MODEL_CATALOG.models[0].id
      }
      if (!OFFICIAL_MODEL_CATALOG.small.some((m) => m.id === form.smallModel)) {
        form.smallModel = OFFICIAL_MODEL_CATALOG.small[0].id
      }
      return
    }
    if (form.searchProvider === 'gateway') {
      form.searchProvider = 'tavily'
    }
  },
)

onMounted(() => {
  void bootstrapOnboarding()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="onboarding"
      role="dialog"
      aria-modal="true"
      aria-label="首次设置引导"
    >
      <div class="onboarding__backdrop" />
      <div class="onboarding__wizard">
        <header class="onboarding__header">
          <p class="onboarding__eyebrow">{{ header.eyebrow }}</p>
          <h2 class="onboarding__title">{{ header.title }}</h2>
          <p class="onboarding__subtitle">{{ header.subtitle }}</p>
        </header>

        <div class="onboarding__phases">
          <button
            v-for="p in phases"
            :key="p.id"
            type="button"
            class="onboarding__phase"
            :class="{ 'is-active': phase === p.id }"
            @click="goPhase(p.id)"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="onboarding__content">
          <!-- 环境 -->
          <template v-if="phase === 'env'">
            <p class="onboarding__section-label">依赖清单</p>
            <div v-if="!probe && probing" class="onboarding__muted">正在检测…</div>
            <article
              v-for="item in probe?.items ?? []"
              :key="item.id"
              class="onboarding__dep"
            >
              <div class="onboarding__dep-main">
                <span
                  class="onboarding__badge"
                  :class="item.status === 'ok' ? 'is-ok' : 'is-bad'"
                >
                  {{ statusLabel(item) }}
                </span>
                <div>
                  <h3>{{ item.label }}</h3>
                  <p>{{ item.detail }}</p>
                </div>
              </div>
              <div class="onboarding__dep-actions">
                <button
                  v-if="canOneClickInstallNode(item)"
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallNode(false)"
                >
                  {{ installingNode ? '准备中…' : '一键准备 Node.js 24.18.0' }}
                </button>
                <button
                  v-if="canReinstallNode(item)"
                  type="button"
                  class="btn-secondary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallNode(true)"
                >
                  {{ installingNode ? '准备中…' : '重新准备' }}
                </button>
                <button
                  v-if="canOneClickInstallOpenCode(item)"
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallOpenCode(false)"
                >
                  {{
                    installingOpenCode
                      ? '准备中…'
                      : '一键准备 OpenCode 1.18.4'
                  }}
                </button>
                <button
                  v-if="canReinstallOpenCode(item)"
                  type="button"
                  class="btn-secondary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallOpenCode(true)"
                >
                  {{ installingOpenCode ? '准备中…' : '重新准备' }}
                </button>
                <button
                  v-if="canOneClickInstallOfficeCli(item)"
                  type="button"
                  class="btn-primary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallOfficeCli"
                >
                  {{
                    installingOfficeCli
                      ? '安装中…'
                      : '一键安装 OfficeCLI 1.0.144'
                  }}
                </button>
                <button
                  v-else-if="canReinstallOfficeCli(item)"
                  type="button"
                  class="btn-secondary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="onInstallOfficeCli"
                >
                  {{ installingOfficeCli ? '安装中…' : '重新安装' }}
                </button>
                <button
                  v-if="item.installUrl"
                  type="button"
                  class="btn-secondary btn-sm"
                  :disabled="anyRuntimeInstalling"
                  @click="openExternal(item.installUrl!)"
                >
                  {{
                    item.id === 'node'
                      ? '查看安装说明'
                      : item.id === 'chrome'
                        ? '打开 Chrome 下载'
                        : item.id === 'officecli'
                          ? '打开安装说明'
                          : '查看安装说明'
                  }}
                </button>
              </div>
            </article>
            <p v-if="nodeInstallProgress" class="onboarding__muted">
              {{ nodeInstallProgress }}
            </p>
            <p v-if="openCodeInstallProgress" class="onboarding__muted">
              {{ openCodeInstallProgress }}
            </p>
            <p v-if="officeCliInstallProgress" class="onboarding__muted">
              {{ officeCliInstallProgress }}
            </p>
            <p
              v-if="nodeInstallResult?.ok"
              class="onboarding__ok"
            >
              {{ nodeInstallResult.message }}
            </p>
            <p
              v-else-if="openCodeInstallResult?.ok"
              class="onboarding__ok"
            >
              {{ openCodeInstallResult.message }}
            </p>
            <p
              v-else-if="officeCliInstallResult?.ok"
              class="onboarding__ok"
            >
              {{ officeCliInstallResult.message }}
            </p>
            <p v-if="error" class="onboarding__error">{{ error }}</p>
            <p
              v-if="nodeInstallResult && !nodeInstallResult.ok && nodeInstallResult.logPath"
              class="onboarding__log-path"
            >
              安装日志：{{ nodeInstallResult.logPath }}
            </p>
            <button
              v-if="nodeInstallResult && !nodeInstallResult.ok && nodeInstallResult.manualUrl"
              type="button"
              class="btn-secondary btn-sm"
              @click="openExternal(nodeInstallResult.manualUrl)"
            >
              查看安装说明
            </button>
            <button
              v-if="openCodeInstallResult && !openCodeInstallResult.ok && openCodeInstallResult.manualUrl"
              type="button"
              class="btn-secondary btn-sm"
              @click="openExternal(openCodeInstallResult.manualUrl)"
            >
              查看 OpenCode 安装说明
            </button>
            <button
              v-if="officeCliInstallResult && !officeCliInstallResult.ok && officeCliInstallResult.manualUrl"
              type="button"
              class="btn-secondary btn-sm"
              @click="openExternal(officeCliInstallResult.manualUrl)"
            >
              查看 OfficeCLI 安装说明
            </button>
          </template>

          <!-- 模型通道 -->
          <template v-else-if="phase === 'keys'">
            <div class="onboarding__section-head">
              <p class="onboarding__section-label">模型通道</p>
              <button
                type="button"
                class="help-link-btn"
                title="官方通道与自定义有什么区别？"
                aria-label="官方通道与自定义有什么区别？"
                @click="openExternal(PRODUCT_LINKS.docsFaqModel)"
              >
                <Icon name="help-circle" :size="14" />
              </button>
            </div>
            <div class="onboarding__card">
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
                </p>
                <div class="active-banner">
                  <Icon name="info" :size="14" />
                  <span v-if="!loggedIn">
                    官方通道需要登录。请先登录，登录后即可开通。
                  </span>
                  <span v-else-if="!snapshot?.officialProvisioned">
                    已登录。请开通官方通道以获取网关凭证。
                  </span>
                  <span v-else>官方通道已开通。</span>
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
                    @click="onProvisionOfficial"
                  >
                    {{ provisioning ? '开通中…' : '开通官方通道' }}
                  </button>
                </div>
                <p v-if="authHint" class="hint-line">{{ authHint }}</p>
                <p v-if="modelsDisabled" class="hint-line">开通后从网关加载可选模型</p>

                <div class="onboarding__grid2">
                  <div>
                    <label class="field-label">默认模型</label>
                    <select
                      v-model="form.model"
                      class="text-input"
                      :disabled="modelsDisabled"
                    >
                      <option v-for="m in modelOptions" :key="m.id" :value="m.id">
                        {{ m.label }}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label class="field-label">轻量模型</label>
                    <select
                      v-model="form.smallModel"
                      class="text-input"
                      :disabled="modelsDisabled"
                    >
                      <option v-for="m in smallModelOptions" :key="m.id" :value="m.id">
                        {{ m.label }}
                      </option>
                    </select>
                  </div>
                </div>
              </template>

              <template v-else>
                <p class="hint-line">
                  使用自备 OpenAI 兼容接口（含自备 DeepSeek 等），不经公司网关计费。可在
                  <button
                    type="button"
                    class="onboarding__link"
                    @click="openExternal(PRODUCT_LINKS.deepseek)"
                  >
                    DeepSeek 开放平台
                  </button>
                  自备 Key 后填写下方。
                </p>

                <label class="field-label">API Key</label>
                <div class="onboarding__key-row">
                  <input
                    v-model="form.apiKey"
                    class="text-input"
                    :type="showApiKey ? 'text' : 'password'"
                    :placeholder="snapshot?.apiKeySet ? '已配置（修改则覆盖）' : '粘贴 API Key'"
                  />
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    @click="showApiKey = !showApiKey"
                  >
                    {{ showApiKey ? '隐藏' : '显示' }}
                  </button>
                </div>

                <label class="field-label">Base URL</label>
                <input
                  v-model="form.baseUrl"
                  class="text-input"
                  placeholder="https://api.deepseek.com/v1"
                />

                <div class="onboarding__grid2">
                  <div>
                    <label class="field-label">默认模型 ID</label>
                    <input
                      v-model="form.customModelId"
                      class="text-input"
                      placeholder="如 deepseek-v4-pro"
                    />
                  </div>
                  <div>
                    <label class="field-label">轻量模型 ID</label>
                    <input
                      v-model="form.customSmallModelId"
                      class="text-input"
                      placeholder="如 deepseek-v4-flash"
                    />
                  </div>
                </div>

                <label class="settings-checkbox">
                  <input v-model="form.customModelSupportsImage" type="checkbox" />
                  <span>
                    默认/轻量模型支持读图（多模态）
                    <span class="muted">勾选后 OpenCode 才允许 Read 图片</span>
                  </span>
                </label>
              </template>
            </div>

            <div class="onboarding__section-head">
              <p class="onboarding__section-label">
                {{ isOfficial ? '搜索服务 · R1 探索需要' : '搜索 API（Tavily）· R1 探索需要' }}
              </p>
              <button
                v-if="!isOfficial"
                type="button"
                class="help-link-btn"
                title="什么是 Tavily？"
                aria-label="什么是 Tavily？"
                @click="openExternal(PRODUCT_LINKS.docsFaqSearch)"
              >
                <Icon name="help-circle" :size="14" />
              </button>
            </div>
            <div v-if="isOfficial" class="onboarding__card">
              <p class="hint-line">
                官方通道下免费提供搜索服务，无需单独配置。
              </p>
            </div>
            <div v-else class="onboarding__card">
              <div class="onboarding__key-row">
                <input
                  v-model="form.tavilyApiKey"
                  class="text-input"
                  :type="showTavilyKey ? 'text' : 'password'"
                  :placeholder="snapshot?.tavilyApiKeySet ? '已配置（修改则覆盖）' : '粘贴 Tavily Key'"
                />
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  @click="showTavilyKey = !showTavilyKey"
                >
                  {{ showTavilyKey ? '隐藏' : '显示' }}
                </button>
              </div>
              <p class="hint-line">
                自定义通道需自备 Tavily Key。免费用户每月约 1000 次调用。前往
                <button
                  type="button"
                  class="onboarding__link"
                  @click="openExternal(PRODUCT_LINKS.tavily)"
                >
                  Tavily 官网
                </button>
                注册获取 Key。说明见
                <button
                  type="button"
                  class="onboarding__link"
                  @click="openExternal(PRODUCT_LINKS.docsFaqSearch)"
                >
                  常见问题
                </button>
                。
              </p>
            </div>

            <div class="onboarding__section-head">
              <p class="onboarding__section-label">
                Google Places API Key · R3 地图发现（可选）
              </p>
              <button
                type="button"
                class="help-link-btn"
                title="如何申请 Places API Key？"
                aria-label="如何申请 Places API Key？"
                @click="openExternal(PRODUCT_LINKS.docsPlacesApiKey)"
              >
                <Icon name="help-circle" :size="14" />
              </button>
            </div>
            <div class="onboarding__card">
              <div class="onboarding__key-row">
                <input
                  v-model="form.placesApiKey"
                  class="text-input"
                  :type="showPlacesKey ? 'text' : 'password'"
                  :placeholder="
                    snapshot?.placesApiKeySet ? '已配置（修改则覆盖）' : 'AIza…（可选）'
                  "
                />
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  @click="showPlacesKey = !showPlacesKey"
                >
                  {{ showPlacesKey ? '隐藏' : '显示' }}
                </button>
              </div>
              <p class="hint-line">
                仅 R3 地图发现需要；R1/R2 可不填。Key 在
                <button
                  type="button"
                  class="onboarding__link"
                  @click="openExternal(PRODUCT_LINKS.googleCloudCredentials)"
                >
                  Google Cloud Console
                </button>
                创建，须启用 <strong>Places API (New)</strong>。申请步骤见
                <button
                  type="button"
                  class="onboarding__link"
                  @click="openExternal(PRODUCT_LINKS.docsPlacesApiKey)"
                >
                  帮助文档
                </button>
                。
              </p>
              <p class="hint-line">
                请求由本机直连 Google 服务。你须在<strong>合法合规、可访问 Google 服务</strong>的网络环境中使用，并遵守当地法规与 Google 政策。与模型 / 搜索通道独立。
              </p>
            </div>
            <p v-if="keysMessage" class="onboarding__ok">{{ keysMessage }}</p>
            <p v-if="keysError" class="onboarding__error">{{ keysError }}</p>
          </template>

          <!-- 业务 -->
          <template v-else>
            <p class="onboarding__section-label">推荐路径</p>
            <div class="onboarding__tour">
              <div class="onboarding__tour-list">
                <button
                  v-for="(step, index) in TOUR_STEPS"
                  :key="step.id"
                  type="button"
                  class="onboarding__tour-item"
                  :class="{ 'is-active': tourStep === index }"
                  @click="setTourStep(index)"
                >
                  <span class="onboarding__tour-num">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span>
                    <strong>{{ step.title }}</strong>
                    <small>{{ step.desc }}</small>
                  </span>
                </button>
              </div>
              <div class="onboarding__tour-detail">
                <p class="onboarding__eyebrow">
                  当前步骤 · {{ String(tourStep + 1).padStart(2, '0') }}
                </p>
                <h3>{{ currentTour.title }}</h3>
                <p>{{ currentTour.detail }}</p>
                <button type="button" class="btn-primary" @click="onOpenTourPage">
                  打开{{ currentTour.title }}页
                </button>
              </div>
            </div>
          </template>
        </div>

        <footer class="onboarding__footer">
          <button
            type="button"
            class="onboarding__skip"
            :disabled="busy || savingKeys"
            @click="phase === 'tour' ? onFinishTour() : skipAll()"
          >
            {{ phase === 'tour' ? '结束引导' : '稍后配置（可随时在设置中重新打开）' }}
          </button>
          <div class="onboarding__footer-actions">
            <template v-if="phase === 'env'">
              <button
                type="button"
                class="btn-secondary"
                :disabled="probing || installingNode || installingOpenCode"
                @click="runProbe"
              >
                {{ probing ? '检测中…' : '重新检测' }}
              </button>
              <button
                type="button"
                class="btn-primary"
                :disabled="busy || installingNode || installingOpenCode"
                @click="onEnvContinue"
              >
                {{ envOk ? '继续' : '继续（仍有缺失）' }}
              </button>
            </template>
            <template v-else-if="phase === 'keys'">
              <button
                v-if="officialNeedsLogin"
                type="button"
                class="btn-primary"
                :disabled="authBusy || loginPending"
                @click="onAuthLogin"
              >
                {{ loginPending ? '登录中…' : '去登录' }}
              </button>
              <button
                v-else-if="officialNeedsProvision"
                type="button"
                class="btn-primary"
                :disabled="provisioning"
                @click="onProvisionOfficial"
              >
                {{ provisioning ? '开通中…' : '开通官方通道' }}
              </button>
              <template v-else>
                <button
                  type="button"
                  class="btn-secondary"
                  :disabled="savingKeys"
                  @click="onSaveKeys(true)"
                >
                  稍后补搜索 Key，继续
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="savingKeys"
                  @click="onSaveKeys(true)"
                >
                  {{ savingKeys ? '保存中…' : '保存并继续' }}
                </button>
              </template>
            </template>
            <template v-else>
              <button
                type="button"
                class="btn-secondary"
                :disabled="busy"
                @click="onFinishTour"
              >
                结束引导
              </button>
              <button type="button" class="btn-primary" @click="onOpenTourPage">
                开始：{{ currentTour.title }}
              </button>
            </template>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
}

.onboarding__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 55%);
}

.onboarding__wizard {
  position: relative;
  z-index: 1;
  width: min(880px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  overflow: auto;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
}

.onboarding__header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.onboarding__eyebrow {
  margin: 0 0 8px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--accent);
}

.onboarding__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
}

.onboarding__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.onboarding__phases {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}

.onboarding__phase {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.onboarding__phase.is-active {
  color: var(--accent);
  font-weight: 600;
  background: var(--accent-muted);
  border-color: var(--accent);
}

.onboarding__content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.onboarding__section-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.onboarding__section-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.onboarding__dep {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
}

.onboarding__dep-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.onboarding__restart {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgb(74 222 128 / 12%);
  border: 1px solid rgb(74 222 128 / 28%);
}

.onboarding__dep-main {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
}

.onboarding__dep h3 {
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--text);
}

.onboarding__dep p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  word-break: break-all;
}

.onboarding__badge {
  flex: 0 0 auto;
  min-width: 48px;
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.onboarding__badge.is-ok {
  color: var(--success, #4ade80);
  background: rgb(74 222 128 / 16%);
}

.onboarding__badge.is-bad {
  color: var(--danger, #f87171);
  background: rgb(248 113 113 / 16%);
}

.onboarding__card {
  padding: 14px;
  border-radius: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.onboarding__key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.onboarding__key-row .text-input {
  flex: 1;
}

.onboarding__grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 720px) {
  .onboarding__grid2 {
    grid-template-columns: 1fr;
  }
}

.onboarding__tour {
  display: grid;
  grid-template-columns: minmax(220px, 340px) 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 800px) {
  .onboarding__tour {
    grid-template-columns: 1fr;
  }
}

.onboarding__tour-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.onboarding__tour-item {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: left;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text);
  cursor: pointer;
}

.onboarding__tour-item strong {
  display: block;
  font-size: 13px;
}

.onboarding__tour-item small {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.onboarding__tour-item.is-active {
  border-color: var(--accent);
  background: var(--accent-muted);
}

.onboarding__tour-num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-hover);
}

.onboarding__tour-item.is-active .onboarding__tour-num {
  color: #fff;
  background: var(--accent);
}

.onboarding__tour-detail {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.onboarding__tour-detail h3 {
  margin: 0;
  font-size: 18px;
}

.onboarding__tour-detail p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.onboarding__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}

.onboarding__skip {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.onboarding__footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.onboarding__muted,
.onboarding__error,
.onboarding__ok {
  margin: 0;
  font-size: 12px;
}

.onboarding__muted {
  color: var(--text-muted);
}

.onboarding__error {
  color: var(--danger, #f87171);
}

.onboarding__log-path {
  margin: 4px 0 0;
  font-size: 11px;
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  color: var(--text-muted);
  word-break: break-all;
  user-select: all;
}

.onboarding__ok {
  color: var(--success, #4ade80);
}

.onboarding__link {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: inherit;
}
</style>
