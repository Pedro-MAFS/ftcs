<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '@/api/client'
import {
  fetchLedger,
  fetchRequest,
  fetchRequests,
  type AdminLedgerListItem,
  type AdminRequestDetail,
  type AdminRequestListItem,
} from '@/api/usage'

const route = useRoute()
const router = useRouter()

type Tab = 'requests' | 'ledger'
const tab = ref<Tab>('requests')

const loading = ref(false)
const error = ref<string | null>(null)
const items = ref<AdminRequestListItem[]>([])
const ledgerItems = ref<AdminLedgerListItem[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const windowLabel = ref('')

const filters = reactive({
  q: '',
  user_id: '',
  model: '',
  billing_status: '',
  type: 'charge',
  /** datetime-local（浏览器本地时区）；提交时转 UTC ISO */
  from: '',
  to: '',
})

const detail = ref<AdminRequestDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

const maxPage = computed(() => Math.max(1, Math.ceil(total.value / size.value)))

function sumLiField(
  row: AdminRequestListItem,
  liKey: 'revenue_li' | 'cogs_li' | 'margin_li',
  yuanKey: 'revenue_yuan' | 'cogs_yuan' | 'margin_yuan',
): number | null {
  const li = row[liKey]
  if (li != null) return typeof li === 'number' ? li : Number(li)
  const yuan = row[yuanKey]
  if (yuan == null || yuan === '') return null
  const n = typeof yuan === 'number' ? yuan : Number(yuan)
  if (Number.isNaN(n)) return null
  return Math.round(n * 1000)
}

/** 当前页用量 / 金额汇总（仅前端，对本页 items） */
const pageSummary = computed(() => {
  let prompt = 0
  let completion = 0
  let revenueLi = 0
  let cogsLi = 0
  let marginLi = 0
  let revenueKnown = 0
  let cogsKnown = 0
  let marginKnown = 0
  for (const row of items.value) {
    if (row.prompt_tokens != null) prompt += row.prompt_tokens
    if (row.completion_tokens != null) completion += row.completion_tokens
    const r = sumLiField(row, 'revenue_li', 'revenue_yuan')
    if (r != null) {
      revenueLi += r
      revenueKnown++
    }
    const c = sumLiField(row, 'cogs_li', 'cogs_yuan')
    if (c != null) {
      cogsLi += c
      cogsKnown++
    }
    const m = sumLiField(row, 'margin_li', 'margin_yuan')
    if (m != null) {
      marginLi += m
      marginKnown++
    }
  }
  return {
    count: items.value.length,
    prompt,
    completion,
    revenueKnown,
    cogsKnown,
    marginKnown,
    revenueYuan: revenueLi / 1000,
    cogsYuan: cogsLi / 1000,
    marginYuan: marginLi / 1000,
  }
})

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Date → datetime-local 值（本地时区，精确到分钟） */
function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** datetime-local → UTC ISO（供 API）；空串返回 undefined */
function datetimeLocalToIsoUtc(local: string): string | undefined {
  if (!local.trim()) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) {
    throw new Error('时间无效，请重新选择')
  }
  return d.toISOString()
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

function billingLabel(s?: string) {
  switch (s) {
    case 'pending':
      return '待结算'
    case 'settling':
      return '结算中'
    case 'charged':
      return '已扣费'
    case 'skipped_no_usage':
      return '无用量'
    case 'settle_failed':
      return '结算失败'
    default:
      return s || '—'
  }
}

function syncFromRoute() {
  const uid = route.query.user_id
  if (typeof uid === 'string' && uid) {
    filters.user_id = uid
  }
  const t = route.query.tab
  if (t === 'ledger') tab.value = 'ledger'
}

async function refresh() {
  loading.value = true
  error.value = null
  try {
    let fromIso: string | undefined
    let toIso: string | undefined
    try {
      fromIso = datetimeLocalToIsoUtc(filters.from)
      toIso = datetimeLocalToIsoUtc(filters.to)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '时间无效'
      return
    }
    if (tab.value === 'requests') {
      const resp = await fetchRequests({
        q: filters.q.trim() || undefined,
        user_id: filters.user_id.trim() || undefined,
        model: filters.model.trim() || undefined,
        billing_status: filters.billing_status || undefined,
        from: fromIso,
        to: toIso,
        page: page.value,
        size: size.value,
      })
      items.value = resp.items ?? []
      total.value = resp.total ?? 0
      page.value = resp.page ?? page.value
      size.value = resp.size ?? size.value
      windowLabel.value =
        resp.window?.from && resp.window?.to
          ? `${formatTime(resp.window.from)} ~ ${formatTime(resp.window.to)}`
          : ''
    } else {
      const resp = await fetchLedger({
        user_id: filters.user_id.trim() || undefined,
        type: filters.type || 'charge',
        request_id: filters.q.trim() || undefined,
        from: fromIso,
        to: toIso,
        page: page.value,
        size: size.value,
      })
      ledgerItems.value = resp.items ?? []
      total.value = resp.total ?? 0
      page.value = resp.page ?? page.value
      size.value = resp.size ?? size.value
      windowLabel.value =
        resp.window?.from && resp.window?.to
          ? `${formatTime(resp.window.from)} ~ ${formatTime(resp.window.to)}`
          : ''
    }
  } catch (e) {
    items.value = []
    ledgerItems.value = []
    total.value = 0
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

function onSearch() {
  page.value = 1
  refresh()
}

function switchTab(next: Tab) {
  if (tab.value === next) return
  tab.value = next
  page.value = 1
  detail.value = null
  router.replace({
    query: {
      ...route.query,
      tab: next === 'ledger' ? 'ledger' : undefined,
    },
  })
  refresh()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  refresh()
}

function nextPage() {
  if (page.value >= maxPage.value) return
  page.value += 1
  refresh()
}

async function openDetail(requestId: string) {
  detailLoading.value = true
  detailError.value = null
  detail.value = null
  try {
    detail.value = await fetchRequest(requestId)
  } catch (e) {
    detailError.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '加载详情失败'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detail.value = null
  detailError.value = null
}

function openUser(userId?: number) {
  if (userId == null) return
  router.push(`/ops/users/${userId}`)
}

watch(
  () => route.query.user_id,
  () => {
    syncFromRoute()
    page.value = 1
    refresh()
  },
)

onMounted(() => {
  syncFromRoute()
  refresh()
})
</script>

<template>
  <div class="page">
    <p class="lead">
      按请求查看计量与结算状态；消费流水默认 <code>charge</code>。金额为人民币元（库内厘 ÷ 1000）。默认近 7
      天。
    </p>

    <div class="tabs">
      <button type="button" class="tab" :class="{ active: tab === 'requests' }" @click="switchTab('requests')">
        请求计量
      </button>
      <button type="button" class="tab" :class="{ active: tab === 'ledger' }" @click="switchTab('ledger')">
        消费流水
      </button>
    </div>

    <section class="card">
      <div class="toolbar">
        <input
          v-model="filters.q"
          type="search"
          :placeholder="tab === 'requests' ? 'user_code / request_id…' : 'request_id…'"
          @keyup.enter="onSearch"
        />
        <input
          v-model="filters.user_id"
          type="text"
          placeholder="user_id"
          style="max-width: 7rem"
          @keyup.enter="onSearch"
        />
        <input
          v-if="tab === 'requests'"
          v-model="filters.model"
          type="text"
          placeholder="model"
          style="max-width: 10rem"
          @keyup.enter="onSearch"
        />
        <select v-if="tab === 'requests'" v-model="filters.billing_status" @change="onSearch">
          <option value="">结算：全部</option>
          <option value="pending">待结算</option>
          <option value="settling">结算中</option>
          <option value="charged">已扣费</option>
          <option value="skipped_no_usage">无用量</option>
          <option value="settle_failed">结算失败</option>
        </select>
        <select v-else v-model="filters.type" @change="onSearch">
          <option value="charge">type: charge</option>
          <option value="topup">type: topup</option>
          <option value="adjust">type: adjust</option>
          <option value="all">type: all</option>
        </select>
        <label class="time-field">
          <span>从</span>
          <input v-model="filters.from" type="datetime-local" step="60" />
        </label>
        <label class="time-field">
          <span>到</span>
          <input v-model="filters.to" type="datetime-local" step="60" />
        </label>
        <button type="button" class="btn" :disabled="loading" title="近 7 天" @click="setPresetDays(7)">
          近7天
        </button>
        <button type="button" class="btn" :disabled="loading" title="近 30 天" @click="setPresetDays(30)">
          近30天
        </button>
        <button type="button" class="btn" :disabled="loading" @click="clearTimeRange">清除时间</button>
        <button type="button" class="btn" :disabled="loading" @click="onSearch">搜索</button>
        <button type="button" class="btn" :disabled="loading" @click="refresh">刷新</button>
      </div>
      <p v-if="windowLabel" class="muted tiny">当前窗口（UTC 存 / 本地显）：{{ windowLabel }}</p>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-else-if="error" class="err">{{ error }}</p>

      <div v-else-if="tab === 'requests'" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>模型</th>
              <th>用量</th>
              <th>金额(元)</th>
              <th>成本(元)</th>
              <th>毛利(元)</th>
              <th>结算</th>
              <th>请求 ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!items.length">
              <td colspan="9" class="muted">暂无记录</td>
            </tr>
            <tr
              v-for="row in items"
              :key="row.request_id"
              class="clickable"
              @click="openDetail(row.request_id)"
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
              <td class="mono">{{ row.model }}</td>
              <td class="mono">
                {{ row.prompt_tokens ?? '—' }} / {{ row.completion_tokens ?? '—' }}
                <span v-if="row.model === 'tavily.search'" class="hint">按次</span>
              </td>
              <td class="mono">{{ formatYuan(row.revenue_yuan) }}</td>
              <td class="mono">{{ formatYuan(row.cogs_yuan) }}</td>
              <td class="mono">{{ formatYuan(row.margin_yuan) }}</td>
              <td>
                <span class="badge" :data-status="row.billing_status">{{
                  billingLabel(row.billing_status)
                }}</span>
              </td>
              <td class="mono small">{{ row.request_id }}</td>
            </tr>
          </tbody>
          <tfoot v-if="items.length">
            <tr class="summary-row">
              <td colspan="3">本页合计（{{ pageSummary.count }} 条）</td>
              <td class="mono">{{ pageSummary.prompt }} / {{ pageSummary.completion }}</td>
              <td class="mono">
                {{ formatYuan(pageSummary.revenueYuan) }}
                <span v-if="pageSummary.revenueKnown < pageSummary.count" class="hint">
                  （{{ pageSummary.revenueKnown }} 笔）
                </span>
              </td>
              <td class="mono">
                {{ formatYuan(pageSummary.cogsYuan) }}
                <span v-if="pageSummary.cogsKnown < pageSummary.count" class="hint">
                  （{{ pageSummary.cogsKnown }} 笔）
                </span>
              </td>
              <td class="mono">
                {{ formatYuan(pageSummary.marginYuan) }}
                <span v-if="pageSummary.marginKnown < pageSummary.count" class="hint">
                  （{{ pageSummary.marginKnown }} 笔）
                </span>
              </td>
              <td colspan="2" class="muted tiny">仅当前页；无金额字段不计入</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>类型</th>
              <th>金额(元)</th>
              <th>余额后(元)</th>
              <th>request_id</th>
              <th>operator</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!ledgerItems.length">
              <td colspan="7" class="muted">暂无记录</td>
            </tr>
            <tr v-for="row in ledgerItems" :key="row.id">
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
              <td>{{ row.type }}</td>
              <td class="mono">{{ formatYuan(row.amount_yuan) }}</td>
              <td class="mono">{{ formatYuan(row.balance_after_yuan) }}</td>
              <td class="mono small">
                <button
                  v-if="row.request_id"
                  type="button"
                  class="link"
                  @click="openDetail(row.request_id)"
                >
                  {{ row.request_id }}
                </button>
                <span v-else>—</span>
              </td>
              <td class="mono">{{ row.operator || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="muted">共 {{ total }} 条 · 第 {{ page }} / {{ maxPage }} 页</span>
        <div class="pager-actions">
          <button type="button" class="btn" :disabled="page <= 1 || loading" @click="prevPage">上一页</button>
          <button
            type="button"
            class="btn"
            :disabled="page >= maxPage || loading"
            @click="nextPage"
          >
            下一页
          </button>
        </div>
      </div>
    </section>

    <div v-if="detail || detailLoading || detailError" class="modal-mask" @click.self="closeDetail">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>请求详情</h3>
        <p v-if="detailLoading" class="muted">加载中…</p>
        <p v-else-if="detailError" class="err">{{ detailError }}</p>
        <template v-else-if="detail">
          <dl class="grid">
            <div><dt>request_id</dt><dd class="mono">{{ detail.request_id }}</dd></div>
            <div><dt>时间</dt><dd class="mono">{{ formatTime(detail.created_at) }}</dd></div>
            <div><dt>用户</dt><dd class="mono">{{ detail.user_code }} ({{ detail.user_id }})</dd></div>
            <div><dt>模型</dt><dd class="mono">{{ detail.model }}</dd></div>
            <div><dt>key_name</dt><dd class="mono">{{ detail.key_name }}</dd></div>
            <div>
              <dt>结算</dt>
              <dd>
                <span class="badge" :data-status="detail.billing_status">{{
                  billingLabel(detail.billing_status)
                }}</span>
              </dd>
            </div>
            <div>
              <dt>用量</dt>
              <dd class="mono">{{ detail.prompt_tokens ?? '—' }} / {{ detail.completion_tokens ?? '—' }}</dd>
            </div>
            <div><dt>扣费(元)</dt><dd class="mono">{{ formatYuan(detail.revenue_yuan) }}</dd></div>
            <div><dt>COGS(元)</dt><dd class="mono">{{ formatYuan(detail.cogs_yuan) }}</dd></div>
            <div><dt>毛利(元)</dt><dd class="mono">{{ formatYuan(detail.margin_yuan) }}</dd></div>
            <div><dt>latency_ms</dt><dd class="mono">{{ detail.latency_ms ?? '—' }}</dd></div>
            <div><dt>upstream</dt><dd class="mono">{{ detail.upstream_status ?? '—' }}</dd></div>
            <div><dt>settle_owner</dt><dd class="mono">{{ detail.settle_owner || '—' }}</dd></div>
            <div>
              <dt>settle_claimed_at</dt>
              <dd class="mono">{{ formatTime(detail.settle_claimed_at) }}</dd>
            </div>
            <div class="full">
              <dt>error_summary</dt>
              <dd>{{ detail.error_summary || '—' }}</dd>
            </div>
            <div class="full" v-if="detail.ledger_charge">
              <dt>ledger charge</dt>
              <dd class="mono">
                id={{ detail.ledger_charge.id }} · amount={{ formatYuan(detail.ledger_charge.amount_yuan) }} 元 ·
                after={{ detail.ledger_charge.balance_after_li }} 厘
              </dd>
            </div>
          </dl>
        </template>
        <div class="modal-actions">
          <button type="button" class="btn" @click="closeDetail">关闭</button>
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

.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.tabs {
  display: flex;
  gap: 0.35rem;
}

.tab {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
  font: inherit;
}

.tab.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.toolbar input,
.toolbar select {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.4rem 0.55rem;
  font: inherit;
  min-width: 8rem;
}

.toolbar input[type='datetime-local'] {
  min-width: 12.5rem;
}

.time-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.82rem;
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

tr.clickable {
  cursor: pointer;
}

tr.clickable:hover {
  background: #f7fafc;
}

.summary-row td {
  border-top: 1px solid var(--line);
  background: #f7fafc;
  font-weight: 600;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #eef2f6;
}

.badge[data-status='charged'] {
  background: #e3f6ee;
  color: var(--ok);
}

.badge[data-status='settling'],
.badge[data-status='pending'] {
  background: #fff7e6;
  color: #b54708;
}

.badge[data-status='settle_failed'] {
  background: #fef3f2;
  color: var(--danger);
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
}

.small {
  font-size: 0.78rem;
}

.hint {
  margin-left: 0.25rem;
  color: var(--muted);
  font-size: 0.75rem;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font: inherit;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.link {
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font: inherit;
  font-weight: 600;
}

.muted {
  color: var(--muted);
}

.tiny {
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}

.err {
  color: var(--danger);
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-top: 0.85rem;
  flex-wrap: wrap;
}

.pager-actions {
  display: flex;
  gap: 0.4rem;
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
  width: min(640px, 100%);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  display: grid;
  gap: 0.7rem;
  max-height: 90vh;
  overflow: auto;
}

.modal h3 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
  margin: 0;
}

.grid .full {
  grid-column: 1 / -1;
}

.grid dt {
  color: var(--muted);
  font-size: 0.78rem;
}

.grid dd {
  margin: 0.15rem 0 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
