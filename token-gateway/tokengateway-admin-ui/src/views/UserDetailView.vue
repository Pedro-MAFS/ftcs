<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '@/api/client'
import {
  fetchUserKeys,
  rotateUserKey,
  updateUserKeyStatus,
  type AdminUserKeyItem,
  type AdminUserKeyRotateResponse,
} from '@/api/keys'
import { fetchUser, updateUserStatus, type AdminUserDetail } from '@/api/users'

const route = useRoute()
const router = useRouter()
const userId = computed(() => String(route.params.id))

const detail = ref<AdminUserDetail | null>(null)
const keys = ref<AdminUserKeyItem[]>([])
const loading = ref(false)
const keysLoading = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const formError = ref<string | null>(null)
const formOk = ref<string | null>(null)
const showAccountConfirm = ref(false)

type KeyModalMode = 'status' | 'rotate'
const keyModal = ref<{
  open: boolean
  mode: KeyModalMode
  key: AdminUserKeyItem | null
}>({ open: false, mode: 'status', key: null })

const rotateResult = ref<AdminUserKeyRotateResponse | null>(null)
const copyOk = ref(false)

const form = reactive({
  operator: '',
  note: '',
})

const targetAccountStatus = computed(() =>
  detail.value?.status === 'disabled' ? 'active' : 'disabled',
)

const accountActionLabel = computed(() =>
  targetAccountStatus.value === 'disabled' ? '禁用账户' : '启用账户',
)

const keyTargetStatus = computed(() =>
  keyModal.value.key?.status === 'disabled' ? 'active' : 'disabled',
)

const keyActionLabel = computed(() => {
  if (keyModal.value.mode === 'rotate') return '强制轮换'
  return keyTargetStatus.value === 'disabled' ? '禁用 Key' : '启用 Key'
})

function formatTime(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function statusLabel(s?: string) {
  if (s === 'active') return '正常'
  if (s === 'disabled') return '冻结'
  return s || '—'
}

function keyStatusLabel(s?: string) {
  if (s === 'active') return '有效'
  if (s === 'disabled') return '禁用'
  return s || '—'
}

async function refresh() {
  loading.value = true
  error.value = null
  try {
    detail.value = await fetchUser(userId.value)
    await refreshKeys()
  } catch (e) {
    detail.value = null
    keys.value = []
    error.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '加载失败'
  } finally {
    loading.value = false
  }
}

async function refreshKeys() {
  keysLoading.value = true
  try {
    const resp = await fetchUserKeys(userId.value)
    keys.value = resp.items ?? []
  } catch (e) {
    keys.value = []
    formError.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '加载 Key 失败'
  } finally {
    keysLoading.value = false
  }
}

function openAccountConfirm() {
  formError.value = null
  formOk.value = null
  showAccountConfirm.value = true
}

function closeAccountConfirm() {
  showAccountConfirm.value = false
}

async function confirmAccountStatus() {
  formError.value = null
  formOk.value = null
  if (!form.operator.trim() || !form.note.trim()) {
    formError.value = 'operator 与 note 必填'
    return
  }
  submitting.value = true
  try {
    detail.value = await updateUserStatus(userId.value, {
      status: targetAccountStatus.value,
      operator: form.operator.trim(),
      note: form.note.trim(),
    })
    formOk.value = `已更新为 ${statusLabel(detail.value.status)}`
    showAccountConfirm.value = false
    form.note = ''
  } catch (e) {
    formError.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '提交失败'
  } finally {
    submitting.value = false
  }
}

function openKeyStatus(row: AdminUserKeyItem) {
  formError.value = null
  formOk.value = null
  keyModal.value = { open: true, mode: 'status', key: row }
}

function openKeyRotate(row: AdminUserKeyItem) {
  formError.value = null
  formOk.value = null
  keyModal.value = { open: true, mode: 'rotate', key: row }
}

function closeKeyModal() {
  keyModal.value = { open: false, mode: 'status', key: null }
}

async function confirmKeyAction() {
  formError.value = null
  formOk.value = null
  const row = keyModal.value.key
  if (!row) return
  if (!form.operator.trim() || !form.note.trim()) {
    formError.value = 'operator 与 note 必填'
    return
  }
  submitting.value = true
  try {
    if (keyModal.value.mode === 'rotate') {
      const resp = await rotateUserKey(userId.value, row.name, {
        operator: form.operator.trim(),
        note: form.note.trim(),
      })
      rotateResult.value = resp
      copyOk.value = false
      closeKeyModal()
      form.note = ''
      await Promise.all([refreshKeys(), refreshDetailSoft()])
    } else {
      await updateUserKeyStatus(userId.value, row.name, {
        status: keyTargetStatus.value,
        operator: form.operator.trim(),
        note: form.note.trim(),
      })
      formOk.value = `Key ${row.name} 已${keyStatusLabel(keyTargetStatus.value)}`
      closeKeyModal()
      form.note = ''
      await Promise.all([refreshKeys(), refreshDetailSoft()])
    }
  } catch (e) {
    formError.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '提交失败'
  } finally {
    submitting.value = false
  }
}

async function refreshDetailSoft() {
  try {
    detail.value = await fetchUser(userId.value)
  } catch {
    /* ignore; keys already refreshed */
  }
}

function closeRotateResult() {
  rotateResult.value = null
  copyOk.value = false
}

async function copyApiKey() {
  const text = rotateResult.value?.api_key
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copyOk.value = true
  } catch {
    copyOk.value = false
    formError.value = '复制失败，请手动选中复制'
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page">
    <button type="button" class="back" @click="router.push('/ops/users')">← 返回用户列表</button>

    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="err">{{ error }}</p>

    <template v-else-if="detail">
      <section class="card header-card">
        <div class="header-row">
          <div>
            <h2 class="mono">{{ detail.user_code }}</h2>
            <p class="meta">
              {{ detail.tenant_id }} ·
              <span class="badge" :data-status="detail.status">{{ statusLabel(detail.status) }}</span>
              · 更新 {{ formatTime(detail.updated_at) }}
            </p>
          </div>
          <button
            type="button"
            class="btn"
            :class="targetAccountStatus === 'disabled' ? 'danger' : 'primary'"
            @click="openAccountConfirm"
          >
            {{ accountActionLabel }}
          </button>
        </div>
        <p v-if="formOk" class="ok">{{ formOk }}</p>
      </section>

      <section class="metrics">
        <div class="metric">
          <div class="label">余额 (元)</div>
          <div class="value mono">{{ detail.balance_yuan }}</div>
          <div class="hint">{{ detail.balance_li }} 厘</div>
        </div>
        <div class="metric">
          <div class="label">API Key</div>
          <div class="value mono">{{ detail.key_total ?? keys.length }}</div>
          <div class="hint">
            {{ detail.key_active ?? 0 }} 有效 / {{ detail.key_disabled ?? 0 }} 禁用
          </div>
        </div>
        <div class="metric">
          <div class="label">日限额</div>
          <div class="value mono">{{ detail.daily_limit_li == null ? '默认' : detail.daily_limit_li }}</div>
          <div class="hint">厘 / 日（只读）</div>
        </div>
        <div class="metric">
          <div class="label">RPM / TPM</div>
          <div class="value mono">
            {{ detail.rpm_limit == null ? '默认' : detail.rpm_limit }} /
            {{ detail.tpm_limit == null ? '默认' : detail.tpm_limit }}
          </div>
          <div class="hint">只读；改限额另开故事</div>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h3>API Key</h3>
          <button type="button" class="btn" :disabled="keysLoading" @click="refreshKeys">
            {{ keysLoading ? '刷新中…' : '刷新' }}
          </button>
        </div>
        <p class="hint">仅展示 name / prefix / status；完整 sk 与 hash 永不回传。禁用后该 sk 返回 403
          <code>key_disabled</code>。</p>
        <div v-if="keysLoading && !keys.length" class="muted">加载 Key…</div>
        <div v-else-if="!keys.length" class="muted">暂无 Key</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>name</th>
                <th>prefix</th>
                <th>状态</th>
                <th>最近使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in keys" :key="row.id">
                <td class="mono">{{ row.name }}</td>
                <td class="mono">{{ row.prefix }}</td>
                <td>
                  <span class="badge" :data-status="row.status">{{ keyStatusLabel(row.status) }}</span>
                </td>
                <td class="mono">{{ formatTime(row.last_used_at) }}</td>
                <td class="actions">
                  <button type="button" class="btn sm" @click="openKeyStatus(row)">
                    {{ row.status === 'disabled' ? '启用' : '禁用' }}
                  </button>
                  <button type="button" class="btn sm" @click="openKeyRotate(row)">强制轮换</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3>账户信息</h3>
        <dl class="grid">
          <div><dt>id</dt><dd class="mono">{{ detail.id }}</dd></div>
          <div><dt>创建时间</dt><dd class="mono">{{ formatTime(detail.created_at) }}</dd></div>
          <div><dt>tenant_id</dt><dd class="mono">{{ detail.tenant_id }}</dd></div>
          <div><dt>user_code</dt><dd class="mono">{{ detail.user_code }}</dd></div>
        </dl>
        <p class="note links">
          <RouterLink
            :to="{ path: '/ops/topups', query: { user_id: String(detail.id) } }"
            >充值记录 →</RouterLink
          >
          <RouterLink
            :to="{ path: '/ops/topups', query: { user_id: String(detail.id), adjust: '1' } }"
            >人工调账 →</RouterLink
          >
          <RouterLink :to="{ path: '/ops/usage', query: { user_id: String(detail.id) } }"
            >查看该用户消费 →</RouterLink
          >
        </p>
      </section>
    </template>

    <div v-if="showAccountConfirm" class="modal-mask" @click.self="closeAccountConfirm">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>{{ accountActionLabel }}</h3>
        <p class="hint">
          将 <code>{{ detail?.user_code }}</code> 设为
          <strong>{{ statusLabel(targetAccountStatus) }}</strong>。禁用后该账户 sk 调用返回 403
          <code>account_disabled</code>。
        </p>
        <label>
          <span>操作人 operator</span>
          <input v-model="form.operator" type="text" maxlength="128" />
        </label>
        <label>
          <span>原因 note</span>
          <input v-model="form.note" type="text" maxlength="512" placeholder="必填说明" />
        </label>
        <p v-if="formError" class="err">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="submitting" @click="closeAccountConfirm">取消</button>
          <button
            type="button"
            class="btn"
            :class="targetAccountStatus === 'disabled' ? 'danger' : 'primary'"
            :disabled="submitting"
            @click="confirmAccountStatus"
          >
            {{ submitting ? '提交中…' : '确认' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="keyModal.open" class="modal-mask" @click.self="closeKeyModal">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>{{ keyActionLabel }}</h3>
        <p v-if="keyModal.mode === 'status'" class="hint">
          将 Key <code>{{ keyModal.key?.name }}</code>（{{ keyModal.key?.prefix }}）设为
          <strong>{{ keyStatusLabel(keyTargetStatus) }}</strong>。
        </p>
        <p v-else class="hint">
          强制轮换 <code>{{ keyModal.key?.name }}</code>：旧 sk 立即失效，新明文仅展示一次；轮换后
          status 置为有效。
        </p>
        <label>
          <span>操作人 operator</span>
          <input v-model="form.operator" type="text" maxlength="128" />
        </label>
        <label>
          <span>原因 note</span>
          <input v-model="form.note" type="text" maxlength="512" placeholder="必填说明" />
        </label>
        <p v-if="formError" class="err">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="submitting" @click="closeKeyModal">取消</button>
          <button
            type="button"
            class="btn"
            :class="keyModal.mode === 'rotate' || keyTargetStatus === 'disabled' ? 'danger' : 'primary'"
            :disabled="submitting"
            @click="confirmKeyAction"
          >
            {{ submitting ? '提交中…' : '确认' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="rotateResult" class="modal-mask" @click.self="closeRotateResult">
      <div class="modal wide" role="dialog" aria-modal="true">
        <h3>新 Key 已签发（仅此一次）</h3>
        <p class="hint">
          action=<code>{{ rotateResult.action }}</code> · name=<code>{{ rotateResult.name }}</code> ·
          prefix=<code>{{ rotateResult.prefix }}</code>
        </p>
        <label>
          <span>api_key</span>
          <textarea class="mono" readonly rows="3" :value="rotateResult.api_key" />
        </label>
        <p v-if="copyOk" class="ok">已复制到剪贴板</p>
        <div class="modal-actions">
          <button type="button" class="btn primary" @click="copyApiKey">复制</button>
          <button type="button" class="btn" @click="closeRotateResult">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1rem;
}

.back {
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  width: fit-content;
  font: inherit;
  font-weight: 600;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}

.header-row,
.section-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.header-row h2 {
  margin: 0;
  font-size: 1.35rem;
}

.meta {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.9rem 1rem;
}

.metric .label {
  color: var(--muted);
  font-size: 0.8rem;
}

.metric .value {
  margin-top: 0.35rem;
  font-size: 1.35rem;
  font-weight: 600;
}

.metric .hint,
.hint {
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.card > .hint {
  margin: 0 0 0.85rem;
  font-size: 0.85rem;
}

h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.section-head h3 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1.25rem;
  margin: 0;
}

.grid dt {
  color: var(--muted);
  font-size: 0.78rem;
}

.grid dd {
  margin: 0.15rem 0 0;
}

.note {
  margin: 1rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.note.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  text-align: left;
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.78rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #eef2f6;
}

.badge[data-status='active'] {
  background: #e3f6ee;
  color: var(--ok);
}

.badge[data-status='disabled'] {
  background: #fef3f2;
  color: var(--danger);
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font: inherit;
}

.btn.sm {
  padding: 0.25rem 0.55rem;
  font-size: 0.82rem;
}

.btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.btn.danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
  font-weight: 600;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.muted {
  color: var(--muted);
}

.err {
  color: var(--danger);
  font-weight: 600;
  margin: 0.5rem 0 0;
}

.ok {
  color: var(--ok);
  font-weight: 600;
  margin: 0.65rem 0 0;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 50;
}

.modal {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  display: grid;
  gap: 0.7rem;
}

.modal.wide {
  width: min(560px, 100%);
}

.modal h3 {
  margin: 0;
}

.modal .hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.modal label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--muted);
}

.modal input,
.modal textarea {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  color: var(--text);
  resize: vertical;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

@media (max-width: 900px) {
  .metrics {
    grid-template-columns: 1fr 1fr;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
