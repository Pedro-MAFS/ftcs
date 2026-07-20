<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useOnboarding } from '../../composables/useOnboarding'
import { PRODUCT_LINKS } from '../../config/links'
import { MODEL_CATALOG, type ModelProviderId, type SettingsSnapshot } from '../../types/settings'
import { TOUR_STEPS } from '../../types/onboarding'
import type { EnvProbeItem } from '../../types/onboarding'

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

const savingKeys = ref(false)
const keysMessage = ref('')
const keysError = ref('')
const showApiKey = ref(false)
const showTavilyKey = ref(false)
const snapshot = ref<SettingsSnapshot | null>(null)

const form = reactive({
  providerId: 'anthropic' as ModelProviderId,
  apiKey: '',
  baseUrl: '',
  model: 'anthropic/claude-sonnet-4-5',
  smallModel: 'anthropic/claude-haiku-4-5',
  customModelId: '',
  customSmallModelId: '',
  searchProvider: 'tavily',
  tavilyApiKey: '',
  searchDailyLimit: 50,
})

const providers: Array<{ id: ModelProviderId; label: string }> = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'custom', label: '自定义兼容' },
]

const phases = [
  { id: 'env' as const, label: '1  环境监测' },
  { id: 'keys' as const, label: '2  密钥配置' },
  { id: 'tour' as const, label: '3  业务引导' },
]

const isCustom = computed(() => form.providerId === 'custom')
const modelOptions = computed(() => MODEL_CATALOG[form.providerId].models)
const smallModelOptions = computed(() => MODEL_CATALOG[form.providerId].small)
const currentTour = computed(() => TOUR_STEPS[tourStep.value] ?? TOUR_STEPS[0])

const header = computed(() => {
  if (phase.value === 'keys') {
    return {
      eyebrow: 'FTCS 首次设置 · 步骤 2 / 3',
      title: '配置模型与搜索密钥',
      subtitle:
        '写入本地 workspace/.env，不会上传。模型用于画像/探索/邮件，搜索 Key 用于 R1 线索探索。',
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
      '安装包保持轻量，以下依赖需本机就绪。缺什么就装什么，装好后点重新检测。',
  }
})

function statusLabel(item: EnvProbeItem): string {
  if (item.status === 'ok') return '就绪'
  if (item.status === 'outdated') return '过旧'
  if (item.status === 'error') return '异常'
  return '缺失'
}

function applySnapshot(data: SettingsSnapshot): void {
  snapshot.value = data
  form.providerId = data.providerId
  form.apiKey = data.apiKeyMasked
  form.baseUrl = data.baseUrl
  form.model = data.model
  form.smallModel = data.smallModel
  form.searchProvider = data.searchProvider
  form.tavilyApiKey = data.tavilyApiKeyMasked
  form.searchDailyLimit = data.searchDailyLimit
  if (data.providerId === 'custom') {
    form.customModelId = data.model.includes('/')
      ? data.model.split('/').slice(1).join('/')
      : data.model
    form.customSmallModelId = data.smallModel.includes('/')
      ? data.smallModel.split('/').slice(1).join('/')
      : data.smallModel
  }
}

async function loadSettings(): Promise<void> {
  if (!window.ftcs?.getSettings) return
  try {
    applySnapshot(await window.ftcs.getSettings())
    keysError.value = ''
  } catch (err) {
    keysError.value = err instanceof Error ? err.message : String(err)
  }
}

async function openExternal(url: string): Promise<void> {
  if (!window.ftcs?.openExternal || !url) return
  await window.ftcs.openExternal(url)
}

async function onSaveKeys(andContinue: boolean): Promise<void> {
  if (!window.ftcs?.saveSettings) return
  savingKeys.value = true
  keysMessage.value = ''
  keysError.value = ''
  try {
    const model =
      form.providerId === 'custom'
        ? form.customModelId.trim() || 'default'
        : form.model
    const smallModel =
      form.providerId === 'custom'
        ? form.customSmallModelId.trim() || form.customModelId.trim() || 'default'
        : form.smallModel
    const result = await window.ftcs.saveSettings({
      providerId: form.providerId,
      apiKey: form.apiKey,
      baseUrl: form.baseUrl,
      model,
      smallModel,
      searchProvider: form.searchProvider,
      tavilyApiKey: form.tavilyApiKey,
      searchDailyLimit: form.searchDailyLimit,
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
  () => form.providerId,
  (id) => {
    if (id === 'custom') return
    const models = MODEL_CATALOG[id].models
    if (models.length && !models.some((m) => m.id === form.model)) {
      form.model = models[0].id
    }
    const smalls = MODEL_CATALOG[id].small
    if (smalls.length && !smalls.some((m) => m.id === form.smallModel)) {
      form.smallModel = smalls[0].id
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
              <button
                v-if="item.installUrl"
                type="button"
                class="btn-secondary btn-sm"
                @click="openExternal(item.installUrl!)"
              >
                {{ item.id === 'node' ? '打开 Node 官网' : item.id === 'chrome' ? '打开 Chrome 下载' : '查看安装说明' }}
              </button>
            </article>
            <p v-if="error" class="onboarding__error">{{ error }}</p>
          </template>

          <!-- 密钥 -->
          <template v-else-if="phase === 'keys'">
            <p class="onboarding__section-label">模型提供商与 API Key</p>
            <div class="onboarding__card">
              <label class="field-label">提供商</label>
              <select v-model="form.providerId" class="text-input">
                <option v-for="p in providers" :key="p.id" :value="p.id">
                  {{ p.label }}
                </option>
              </select>

              <label class="field-label">模型 API Key</label>
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

              <div v-if="isCustom" class="onboarding__grid2">
                <div>
                  <label class="field-label">Base URL</label>
                  <input v-model="form.baseUrl" class="text-input" placeholder="https://..." />
                </div>
                <div>
                  <label class="field-label">默认模型 ID</label>
                  <input v-model="form.customModelId" class="text-input" />
                </div>
              </div>
              <div v-else class="onboarding__grid2">
                <div>
                  <label class="field-label">默认模型</label>
                  <select v-model="form.model" class="text-input">
                    <option v-for="m in modelOptions" :key="m.id" :value="m.id">
                      {{ m.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="field-label">轻量模型</label>
                  <select v-model="form.smallModel" class="text-input">
                    <option v-for="m in smallModelOptions" :key="m.id" :value="m.id">
                      {{ m.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div class="onboarding__card">
              <label class="field-label">搜索 API（Tavily）· R1 探索需要</label>
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
                没有搜索 Key 仍可先完成画像与关键词；探索前再补。安装说明见
                <button
                  type="button"
                  class="onboarding__link"
                  @click="openExternal(PRODUCT_LINKS.docsInstall)"
                >
                  帮助文档
                </button>
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
                :disabled="probing"
                @click="runProbe"
              >
                {{ probing ? '检测中…' : '重新检测' }}
              </button>
              <button
                type="button"
                class="btn-primary"
                :disabled="busy"
                @click="onEnvContinue"
              >
                {{ envOk ? '继续' : '继续（仍有缺失）' }}
              </button>
            </template>
            <template v-else-if="phase === 'keys'">
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
