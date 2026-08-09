<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '@/api/client'
import { fetchUser, updateUserStatus, type AdminUserDetail } from '@/api/users'

const route = useRoute()
const router = useRouter()
const userId = computed(() => String(route.params.id))

const detail = ref<AdminUserDetail | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const formError = ref<string | null>(null)
const formOk = ref<string | null>(null)
const showConfirm = ref(false)

const form = reactive({
  operator: '',
  note: '',
})

const targetStatus = computed(() =>
  detail.value?.status === 'disabled' ? 'active' : 'disabled',
)

const actionLabel = computed(() =>
  targetStatus.value === 'disabled' ? '禁用账户' : '启用账户',
)

function formatTime(iso?: string) {
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

async function refresh() {
  loading.value = true
  error.value = null
  try {
    detail.value = await fetchUser(userId.value)
  } catch (e) {
    detail.value = null
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

function openConfirm() {
  formError.value = null
  formOk.value = null
  showConfirm.value = true
}

function closeConfirm() {
  showConfirm.value = false
}

async function confirmStatus() {
  formError.value = null
  formOk.value = null
  if (!form.operator.trim() || !form.note.trim()) {
    formError.value = 'operator 与 note 必填'
    return
  }
  submitting.value = true
  try {
    detail.value = await updateUserStatus(userId.value, {
      status: targetStatus.value,
      operator: form.operator.trim(),
      note: form.note.trim(),
    })
    formOk.value = `已更新为 ${statusLabel(detail.value.status)}`
    showConfirm.value = false
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
            :class="targetStatus === 'disabled' ? 'danger' : 'primary'"
            @click="openConfirm"
          >
            {{ actionLabel }}
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
          <div class="value mono">{{ detail.key_total ?? 0 }}</div>
          <div class="hint">{{ detail.key_active ?? 0 }} 有效 / {{ detail.key_disabled ?? 0 }} 禁用</div>
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
        <h3>账户信息</h3>
        <dl class="grid">
          <div><dt>id</dt><dd class="mono">{{ detail.id }}</dd></div>
          <div><dt>创建时间</dt><dd class="mono">{{ formatTime(detail.created_at) }}</dd></div>
          <div><dt>tenant_id</dt><dd class="mono">{{ detail.tenant_id }}</dd></div>
          <div><dt>user_code</dt><dd class="mono">{{ detail.user_code }}</dd></div>
        </dl>
        <p class="note">Key 启停 / 调账 / 消费明细见后续 G6-05～07。</p>
      </section>
    </template>

    <div v-if="showConfirm" class="modal-mask" @click.self="closeConfirm">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>{{ actionLabel }}</h3>
        <p class="hint">
          将 <code>{{ detail?.user_code }}</code> 设为
          <strong>{{ statusLabel(targetStatus) }}</strong>。禁用后该账户 sk 调用返回 403
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
          <button type="button" class="btn" :disabled="submitting" @click="closeConfirm">取消</button>
          <button
            type="button"
            class="btn"
            :class="targetStatus === 'disabled' ? 'danger' : 'primary'"
            :disabled="submitting"
            @click="confirmStatus"
          >
            {{ submitting ? '提交中…' : '确认' }}
          </button>
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

.header-row {
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

.metric .hint {
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: 0.78rem;
}

h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
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

.modal input {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  color: var(--text);
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
