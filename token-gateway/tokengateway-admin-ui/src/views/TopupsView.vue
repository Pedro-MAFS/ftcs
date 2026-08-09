<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '@/api/client'
import {
  fetchCreditsLedger,
  fetchWechatOrders,
  postAdjustment,
  type AdminLedgerListItem,
  type AdminWechatOrderItem,
} from '@/api/topups'

const route = useRoute()
const router = useRouter()

const loadingOrders = ref(false)
const loadingLedger = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const formError = ref<string | null>(null)
const formOk = ref<string | null>(null)
const linkHint = ref<string | null>(null)

const orderItems = ref<AdminWechatOrderItem[]>([])
const orderTotal = ref(0)
const orderPage = ref(1)
const orderSize = ref(20)

const ledgerItems = ref<AdminLedgerListItem[]>([])
const ledgerTotal = ref(0)
const ledgerPage = ref(1)
const ledgerSize = ref(20)

const windowLabel = ref('')
const showForm = ref(false)
const selectedOrder = ref<AdminWechatOrderItem | null>(null)

const filters = reactive({
  user_id: '',
  order_status: '',
  out_trade_no: '',
  type: 'credits',
  operator: '',
  from: '',
  to: '',
})

const form = reactive({
  user_id: '',
  type: 'topup' as 'topup' | 'adjust',
  amount_yuan: '',
  operator: '',
  note: '',
})

const loading = computed(() => loadingOrders.value || loadingLedger.value)
const orderMaxPage = computed(() => Math.max(1, Math.ceil(orderTotal.value / orderSize.value)))
const ledgerMaxPage = computed(() => Math.max(1, Math.ceil(ledgerTotal.value / ledgerSize.value)))

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function datetimeLocalToIsoUtc(local: string): string | undefined {
  if (!local.trim()) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) throw new Error('时间无效，请重新选择')
  return d.toISOString()
}

function resolveTimeIso(): { fromIso?: string; toIso?: string } {
  return {
    fromIso: datetimeLocalToIsoUtc(filters.from),
    toIso: datetimeLocalToIsoUtc(filters.to),
  }
}

function setPresetDays(days: number) {
  const to = new Date()
  to.setSeconds(0, 0)
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  filters.from = toDatetimeLocalValue(from)
  filters.to = toDatetimeLocalValue(to)
  onSearch()
}

function clearTimeRange() {
  filters.from = ''
  filters.to = ''
  onSearch()
}

function formatTime(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function formatYuan(v?: number | string | null) {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(3)
}

function sourceLabel(s?: string | null) {
  if (s === 'wechat') return '微信'
  if (s === 'manual') return '人工'
  return '—'
}

function typeLabel(t?: string) {
  if (t === 'topup') return '充值'
  if (t === 'adjust') return '调账'
  return t || '—'
}

function orderStatusLabel(s?: string) {
  const map: Record<string, string> = {
    created: '待支付',
    paid: '已支付（入账中）',
    credited: '已入账',
    failed: '失败',
    closed: '已关闭',
  }
  return (s && map[s]) || s || '—'
}

function isLedgerHighlighted(row: AdminLedgerListItem): boolean {
  const sel = selectedOrder.value
  if (!sel) return false
  if (sel.ledger_request_id && row.request_id === sel.ledger_request_id) return true
  if (sel.out_trade_no && row.note && row.note.includes(sel.out_trade_no)) return true
  return false
}

function updateLinkHint() {
  const sel = selectedOrder.value
  if (!sel) {
    linkHint.value = null
    return
  }
  const matched = ledgerItems.value.some((row) => isLedgerHighlighted(row))
  if (matched) {
    linkHint.value = `已选订单 ${sel.out_trade_no}：下表高亮关联流水`
  } else {
    linkHint.value = `订单 ${sel.out_trade_no} 尚未入账（当前页 ledger 无匹配）`
  }
}

function syncFromRoute() {
  const uid = route.query.user_id
  if (typeof uid === 'string' && uid) {
    filters.user_id = uid
    form.user_id = uid
  }
  if (route.query.adjust === '1') {
    showForm.value = true
  }
}

async function refreshOrders() {
  loadingOrders.value = true
  try {
    const { fromIso, toIso } = resolveTimeIso()
    const resp = await fetchWechatOrders({
      user_id: filters.user_id.trim() || undefined,
      status: filters.order_status || undefined,
      out_trade_no: filters.out_trade_no.trim() || undefined,
      from: fromIso,
      to: toIso,
      page: orderPage.value,
      size: orderSize.value,
    })
    orderItems.value = resp.items ?? []
    orderTotal.value = resp.total ?? 0
    orderPage.value = resp.page ?? orderPage.value
    orderSize.value = resp.size ?? orderSize.value
    if (resp.window?.from && resp.window?.to) {
      windowLabel.value = `${formatTime(resp.window.from)} ~ ${formatTime(resp.window.to)}`
    }
    if (selectedOrder.value) {
      const still = orderItems.value.find((o) => o.id === selectedOrder.value?.id)
      selectedOrder.value = still ?? null
    }
    updateLinkHint()
  } catch (e) {
    orderItems.value = []
    orderTotal.value = 0
    throw e
  } finally {
    loadingOrders.value = false
  }
}

async function refreshLedger() {
  loadingLedger.value = true
  try {
    const { fromIso, toIso } = resolveTimeIso()
    const resp = await fetchCreditsLedger({
      user_id: filters.user_id.trim() || undefined,
      type: filters.type || 'credits',
      operator: filters.operator.trim() || undefined,
      from: fromIso,
      to: toIso,
      page: ledgerPage.value,
      size: ledgerSize.value,
    })
    ledgerItems.value = resp.items ?? []
    ledgerTotal.value = resp.total ?? 0
    ledgerPage.value = resp.page ?? ledgerPage.value
    ledgerSize.value = resp.size ?? ledgerSize.value
    if (!windowLabel.value && resp.window?.from && resp.window?.to) {
      windowLabel.value = `${formatTime(resp.window.from)} ~ ${formatTime(resp.window.to)}`
    }
    updateLinkHint()
  } catch (e) {
    ledgerItems.value = []
    ledgerTotal.value = 0
    throw e
  } finally {
    loadingLedger.value = false
  }
}

async function refresh() {
  error.value = null
  windowLabel.value = ''
  try {
    resolveTimeIso()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '时间无效'
    return
  }
  const results = await Promise.allSettled([refreshOrders(), refreshLedger()])
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
  if (failed) {
    const e = failed.reason
    error.value = e instanceof AdminApiError ? e.message : String(e)
  }
}

function onSearch() {
  orderPage.value = 1
  ledgerPage.value = 1
  selectedOrder.value = null
  linkHint.value = null
  void refresh()
}

function selectOrder(row: AdminWechatOrderItem) {
  if (selectedOrder.value?.id === row.id) {
    selectedOrder.value = null
    linkHint.value = null
    return
  }
  selectedOrder.value = row
  if (row.user_id != null) {
    form.user_id = String(row.user_id)
  }
  updateLinkHint()
}

function openUser(userId: number) {
  router.push(`/ops/users/${userId}`)
}

function openForm(fromSelected = false) {
  formError.value = null
  formOk.value = null
  if (!form.user_id && filters.user_id) {
    form.user_id = filters.user_id
  }
  if (fromSelected && selectedOrder.value) {
    const o = selectedOrder.value
    if (o.user_id != null) form.user_id = String(o.user_id)
    if (!form.note.trim()) {
      form.note = `manual for wechat order ${o.out_trade_no}`
    }
    if (!form.amount_yuan.trim() && o.amount_yuan != null && o.status !== 'credited') {
      form.amount_yuan = String(o.amount_yuan)
    }
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  formError.value = null
}

async function submitAdjustment() {
  formError.value = null
  formOk.value = null
  const uid = form.user_id.trim()
  if (!uid) {
    formError.value = '请填写用户 id'
    return
  }
  if (!form.operator.trim() || !form.note.trim()) {
    formError.value = 'operator 与 note 必填'
    return
  }
  const yuan = form.amount_yuan.trim()
  if (!yuan) {
    formError.value = '请填写金额（元）'
    return
  }
  const n = Number(yuan)
  if (Number.isNaN(n)) {
    formError.value = '金额无效'
    return
  }
  if (form.type === 'topup' && n <= 0) {
    formError.value = '充值金额须大于 0'
    return
  }
  if (form.type === 'adjust' && n === 0) {
    formError.value = '调账金额不能为 0'
    return
  }
  submitting.value = true
  try {
    const resp = await postAdjustment(uid, {
      type: form.type,
      amount_yuan: yuan,
      operator: form.operator.trim(),
      note: form.note.trim(),
    })
    formOk.value = `成功：ledger #${resp.ledger_id}，余额后 ${formatYuan(resp.balance_after_yuan)} 元`
    filters.user_id = uid
    showForm.value = false
    form.amount_yuan = ''
    form.note = ''
    await refresh()
  } catch (e) {
    formError.value = e instanceof AdminApiError ? `${e.code || e.status}: ${e.message}` : String(e)
  } finally {
    submitting.value = false
  }
}

watch(
  () => route.query,
  () => {
    syncFromRoute()
    void refresh()
  },
)

onMounted(() => {
  syncFromRoute()
  if (!filters.from && !filters.to) {
    setPresetDays(7)
  } else {
    void refresh()
  }
})
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h2>充值管理</h2>
        <p class="muted">
          上表为微信订单（决策上下文）；下表为账本充值/调账（余额真相）。金额单位为人民币元。
        </p>
      </div>
      <div class="head-actions">
        <button
          type="button"
          class="btn"
          :disabled="!selectedOrder"
          @click="openForm(true)"
        >
          针对选中单调账
        </button>
        <button type="button" class="btn primary" @click="openForm(false)">人工充值 / 调账</button>
      </div>
    </header>

    <section class="card filters">
      <label>
        <span>用户 id</span>
        <input v-model="filters.user_id" type="text" placeholder="共享筛选" />
      </label>
      <label>
        <span>订单状态</span>
        <select v-model="filters.order_status">
          <option value="">全部</option>
          <option value="created">待支付</option>
          <option value="paid">已支付（入账中）</option>
          <option value="credited">已入账</option>
          <option value="failed">失败</option>
          <option value="closed">已关闭</option>
        </select>
      </label>
      <label>
        <span>商户单号</span>
        <input v-model="filters.out_trade_no" type="text" placeholder="精确 out_trade_no" />
      </label>
      <label>
        <span>账本类型</span>
        <select v-model="filters.type">
          <option value="credits">充值+调账</option>
          <option value="topup">仅充值</option>
          <option value="adjust">仅调账</option>
        </select>
      </label>
      <label>
        <span>operator</span>
        <input v-model="filters.operator" type="text" placeholder="下表：wechat_pay / ops:…" />
      </label>
      <label>
        <span>从</span>
        <input v-model="filters.from" type="datetime-local" />
      </label>
      <label>
        <span>到</span>
        <input v-model="filters.to" type="datetime-local" />
      </label>
      <div class="filter-actions">
        <button type="button" class="btn" :disabled="loading" @click="onSearch">查询</button>
        <button type="button" class="btn ghost" @click="setPresetDays(7)">近 7 天</button>
        <button type="button" class="btn ghost" @click="setPresetDays(30)">近 30 天</button>
        <button type="button" class="btn ghost" @click="clearTimeRange">清空时间</button>
      </div>
      <p v-if="windowLabel" class="muted tiny">窗口：{{ windowLabel }}</p>
      <p v-if="linkHint" class="hint-line">{{ linkHint }}</p>
      <p v-if="formOk" class="ok">{{ formOk }}</p>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <section class="card">
      <div class="section-head">
        <h3>微信订单</h3>
        <span class="muted tiny">点击行可联动下表；再次点击取消选中</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>下单时间</th>
              <th>用户</th>
              <th>状态</th>
              <th>金额(元)</th>
              <th>out_trade_no</th>
              <th>微信单号</th>
              <th>fail_reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingOrders">
              <td colspan="7" class="muted">加载中…</td>
            </tr>
            <tr v-else-if="!orderItems.length">
              <td colspan="7" class="muted">暂无微信订单</td>
            </tr>
            <tr
              v-for="row in orderItems"
              :key="row.id"
              class="clickable"
              :class="{ selected: selectedOrder?.id === row.id }"
              @click="selectOrder(row)"
            >
              <td class="mono">{{ formatTime(row.created_at) }}</td>
              <td>
                <button
                  v-if="row.user_id"
                  type="button"
                  class="link"
                  @click.stop="openUser(row.user_id)"
                >
                  {{ row.user_code || row.user_id }}
                </button>
                <span v-else>—</span>
              </td>
              <td>
                <span class="badge" :data-order-status="row.status">{{
                  orderStatusLabel(row.status)
                }}</span>
              </td>
              <td class="mono">{{ formatYuan(row.amount_yuan) }}</td>
              <td class="mono small">{{ row.out_trade_no }}</td>
              <td class="mono small">{{ row.wx_transaction_id || '—' }}</td>
              <td class="note-cell">{{ row.fail_reason || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">共 {{ orderTotal }} 条 · 第 {{ orderPage }} / {{ orderMaxPage }} 页</span>
        <div class="pager-actions">
          <button
            type="button"
            class="btn"
            :disabled="orderPage <= 1 || loadingOrders"
            @click="orderPage -= 1; refreshOrders()"
          >
            上一页
          </button>
          <button
            type="button"
            class="btn"
            :disabled="orderPage >= orderMaxPage || loadingOrders"
            @click="orderPage += 1; refreshOrders()"
          >
            下一页
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <h3>账本（充值 / 调账）</h3>
        <span class="muted tiny">余额真相；人工调账写此表</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>类型</th>
              <th>来源</th>
              <th>金额(元)</th>
              <th>余额后(元)</th>
              <th>operator</th>
              <th>note</th>
              <th>request_id</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingLedger">
              <td colspan="9" class="muted">加载中…</td>
            </tr>
            <tr v-else-if="!ledgerItems.length">
              <td colspan="9" class="muted">暂无记录</td>
            </tr>
            <tr
              v-for="row in ledgerItems"
              :key="row.id"
              :class="{ highlight: isLedgerHighlighted(row) }"
            >
              <td class="mono">{{ formatTime(row.created_at) }}</td>
              <td>
                <button
                  v-if="row.user_id"
                  type="button"
                  class="link"
                  @click="openUser(row.user_id)"
                >
                  {{ row.user_code || row.user_id }}
                </button>
                <span v-else>—</span>
              </td>
              <td>{{ typeLabel(row.type) }}</td>
              <td>
                <span class="badge" :data-source="row.source">{{ sourceLabel(row.source) }}</span>
              </td>
              <td class="mono">{{ formatYuan(row.amount_yuan) }}</td>
              <td class="mono">{{ formatYuan(row.balance_after_yuan) }}</td>
              <td class="mono">{{ row.operator || '—' }}</td>
              <td class="note-cell">{{ row.note || '—' }}</td>
              <td class="mono small">{{ row.request_id || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted"
          >共 {{ ledgerTotal }} 条 · 第 {{ ledgerPage }} / {{ ledgerMaxPage }} 页</span
        >
        <div class="pager-actions">
          <button
            type="button"
            class="btn"
            :disabled="ledgerPage <= 1 || loadingLedger"
            @click="ledgerPage -= 1; refreshLedger()"
          >
            上一页
          </button>
          <button
            type="button"
            class="btn"
            :disabled="ledgerPage >= ledgerMaxPage || loadingLedger"
            @click="ledgerPage += 1; refreshLedger()"
          >
            下一页
          </button>
        </div>
      </div>
      <p class="muted tiny">
        上表为微信订单；下表为账本。微信入账 operator=wechat_pay；人工禁止冒充该值。
      </p>
    </section>

    <div v-if="showForm" class="modal-mask" @click.self="closeForm">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>人工充值 / 调账</h3>
        <p class="hint">
          <strong>充值</strong>金额须 &gt; 0；<strong>调账</strong>可为负（纠错扣回），结果余额不得为负。
        </p>
        <label>
          <span>用户 id</span>
          <input v-model="form.user_id" type="text" />
        </label>
        <label>
          <span>类型</span>
          <select v-model="form.type">
            <option value="topup">充值 topup</option>
            <option value="adjust">调账 adjust</option>
          </select>
        </label>
        <label>
          <span>金额（元）</span>
          <input
            v-model="form.amount_yuan"
            type="text"
            placeholder="如 10 或 -5.000（调账）"
          />
        </label>
        <label>
          <span>操作人 operator</span>
          <input v-model="form.operator" type="text" maxlength="128" placeholder="ops:alice" />
        </label>
        <label>
          <span>原因 note</span>
          <input v-model="form.note" type="text" maxlength="512" placeholder="必填说明" />
        </label>
        <p v-if="formError" class="err">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="submitting" @click="closeForm">取消</button>
          <button
            type="button"
            class="btn primary"
            :disabled="submitting"
            @click="submitAdjustment"
          >
            {{ submitting ? '提交中…' : '确认提交' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.head h2 {
  margin: 0 0 6px;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}
.section-head h3 {
  margin: 0;
  font-size: 15px;
}
.card {
  background: var(--panel, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 14px 16px;
}
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px 12px;
  align-items: end;
}
.filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.filters input,
.filters select,
.modal input,
.modal select {
  padding: 7px 9px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  font: inherit;
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  grid-column: 1 / -1;
}
.btn {
  border: 1px solid var(--border, #d1d5db);
  background: #fff;
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font: inherit;
}
.btn.primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #eee);
  vertical-align: top;
}
th {
  color: var(--muted, #6b7280);
  font-weight: 500;
}
tr.clickable {
  cursor: pointer;
}
tr.clickable:hover {
  background: #f9fafb;
}
tr.selected {
  background: #eff6ff;
}
tr.highlight {
  background: #fef9c3;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.small {
  font-size: 11px;
  word-break: break-all;
}
.note-cell {
  max-width: 220px;
  word-break: break-word;
}
.link {
  border: 0;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font: inherit;
}
.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: #f3f4f6;
}
.badge[data-source='wechat'],
.badge[data-order-status='credited'] {
  background: #ecfdf5;
  color: #047857;
}
.badge[data-source='manual'] {
  background: #eff6ff;
  color: #1d4ed8;
}
.badge[data-order-status='created'] {
  background: #fff7ed;
  color: #c2410c;
}
.badge[data-order-status='paid'] {
  background: #eef2ff;
  color: #4338ca;
}
.badge[data-order-status='failed'],
.badge[data-order-status='closed'] {
  background: #fef2f2;
  color: #b91c1c;
}
.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  gap: 12px;
}
.pager-actions {
  display: flex;
  gap: 8px;
}
.muted {
  color: var(--muted, #6b7280);
}
.tiny {
  font-size: 12px;
}
.hint-line {
  margin: 0;
  grid-column: 1 / -1;
  font-size: 13px;
  color: #1d4ed8;
}
.err {
  color: #b91c1c;
  margin: 0;
}
.ok {
  color: #047857;
  margin: 0;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 16px;
}
.modal {
  width: min(440px, 100%);
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal h3 {
  margin: 0;
}
.modal .hint {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}
.modal label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
</style>
