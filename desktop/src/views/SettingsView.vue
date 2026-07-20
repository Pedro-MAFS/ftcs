<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Icon from '../components/shared/Icon.vue'
import { useAppStatus } from '../composables/useAppStatus'
import { useAuth } from '../composables/useAuth'
import { useSettingsNav } from '../composables/useSettingsNav'
import { SECTION_META } from '../types/workspace'
import type { ModelProviderId, SettingsSnapshot } from '../types/settings'
import { MODEL_CATALOG } from '../types/settings'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import { PRODUCT_LINKS } from '../config/links'
import { useOnboarding } from '../composables/useOnboarding'

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
const confirmLogout = ref(false)
const authHint = ref('')

const saving = ref(false)
const message = ref('')
const error = ref('')
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

const categories: Array<{ id: typeof activeCategory.value; label: string }> = [
  { id: 'account', label: '账号与授权' },
  { id: 'model', label: '模型与提供商' },
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

const isCustom = computed(() => form.providerId === 'custom')
const usagePct = computed(() => {
  const limit = form.searchDailyLimit || 1
  const used = snapshot.value?.searchUsedToday ?? 0
  return Math.min(100, Math.round((used / limit) * 100))
})

const modelOptions = computed(() => MODEL_CATALOG[form.providerId].models)
const smallModelOptions = computed(() => MODEL_CATALOG[form.providerId].small)

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
  if (!window.ftcs?.getSettings) {
    error.value = '未检测到设置 API（请在桌面应用中运行）'
    return
  }
  try {
    const data = await window.ftcs.getSettings()
    applySnapshot(data)
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

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

async function onSave(): Promise<void> {
  if (!window.ftcs?.saveSettings) return
  saving.value = true
  message.value = ''
  error.value = ''
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
})
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

        <!-- 模型与提供商 -->
        <section id="settings-model" class="settings-block">
          <div class="settings-block__head">
            <h3>模型与提供商</h3>
            <span class="muted mono">.env · FTCS_MODEL / provider</span>
          </div>

          <label class="field-label">提供商</label>
          <div class="provider-row">
            <button
              v-for="p in providers"
              :key="p.id"
              type="button"
              class="provider-chip"
              :class="{ 'is-active': form.providerId === p.id }"
              @click="form.providerId = p.id"
            >
              {{ p.label }}
            </button>
          </div>

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

          <label class="field-label">Base URL（自定义兼容时填写）</label>
          <input
            v-model="form.baseUrl"
            class="text-input"
            :disabled="!isCustom"
            :class="{ 'is-disabled': !isCustom }"
            placeholder="https://api.example.com/v1"
            autocomplete="off"
          />

          <div class="field-grid">
            <div>
              <label class="field-label">默认模型</label>
              <select v-if="!isCustom" v-model="form.model" class="text-input">
                <option v-for="m in modelOptions" :key="m.id" :value="m.id">
                  {{ m.label }} ({{ m.id }})
                </option>
              </select>
              <input
                v-else
                v-model="form.customModelId"
                class="text-input"
                placeholder="模型 ID，如 gpt-4o"
                autocomplete="off"
              />
            </div>
            <div>
              <label class="field-label">轻量模型（small_model）</label>
              <select v-if="!isCustom" v-model="form.smallModel" class="text-input">
                <option v-for="m in smallModelOptions" :key="m.id" :value="m.id">
                  {{ m.label }} ({{ m.id }})
                </option>
              </select>
              <input
                v-else
                v-model="form.customSmallModelId"
                class="text-input"
                placeholder="轻量模型 ID"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="active-banner">
            <Icon name="info" :size="14" />
            <span>
              当前生效
              <code>{{ isCustom ? `custom/${form.customModelId || '…'}` : form.model }}</code>
              · 保存后自动重启 OpenCode
            </span>
          </div>
        </section>

        <hr class="settings-divider" />

        <!-- 搜索 -->
        <section id="settings-search" class="settings-block">
          <div class="settings-block__head">
            <h3>搜索服务</h3>
            <span class="muted mono">workspace/.env · SEARCH_*</span>
          </div>

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

          <div class="usage-row">
            <span class="mono">
              今日用量 {{ snapshot?.searchUsedToday ?? 0 }} / {{ form.searchDailyLimit }}
            </span>
            <div class="usage-bar">
              <i :style="{ width: `${usagePct}%` }" />
            </div>
            <span class="mono muted">{{ usagePct }}%</span>
          </div>
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
            <span class="mono">FTCS Desktop 0.2.0</span>
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
          <p class="hint-line">用于检测 Node / OpenCode / Chrome，并引导配置密钥与主流程。</p>

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
          </div>
          <p class="hint-line mono">{{ PRODUCT_LINKS.website }}</p>

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
  </section>
</template>
