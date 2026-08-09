<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { AdminApiError } from '@/api/client'
import {
  DEFAULT_ALLOWED_MODELS,
  TAVILY_SEARCH,
  createPrice,
  fetchPrices,
  isPerCallModel,
  type AdminPriceItem,
  type AdminPriceCreateBody,
} from '@/api/prices'

const items = ref<AdminPriceItem[]>([])
const asOf = ref<string>('')
const loading = ref(false)
const submitting = ref(false)
const includeHistory = ref(true)
const listError = ref<string | null>(null)
const formError = ref<string | null>(null)
const formOk = ref<string | null>(null)

const form = reactive({
  model: DEFAULT_ALLOWED_MODELS[0] as string,
  /** datetime-local：浏览器本地时区，提交时再转 UTC ISO */
  effectiveLocal: '',
  operator: '',
  note: '',
  // Chat 厘/MTok（默认空，加载后填入当前生效价）
  inputLi: '',
  outputLi: '',
  upInLi: '',
  upCacheLi: '',
  upOutLi: '',
  // tavily 厘/次
  priceLiPerCall: '',
  cogsLiPerCall: '',
})

/** 表单价格是否已按「当前」预填 */
const filledFromCurrent = ref(false)

const perCall = computed(() => isPerCallModel(form.model))

const effectiveUtcPreview = computed(() => {
  if (!form.effectiveLocal) return ''
  try {
    return datetimeLocalToIsoUtc(form.effectiveLocal)
  } catch {
    return ''
  }
})

function liStr(v?: number): string {
  return v == null ? '' : String(v)
}

function clearPriceFields() {
  form.inputLi = ''
  form.outputLi = ''
  form.upInLi = ''
  form.upCacheLi = ''
  form.upOutLi = ''
  form.priceLiPerCall = ''
  form.cogsLiPerCall = ''
  filledFromCurrent.value = false
}

/** 用该 model 的「当前」生效价预填表单（不改 operator / note / 生效时间） */
function fillFormFromCurrent(model: string) {
  const cur = items.value.find((i) => i.model === model && i.status === 'current')
  if (!cur) {
    clearPriceFields()
    return
  }
  if (isPerCallModel(model)) {
    form.priceLiPerCall = liStr(cur.price_li_per_call)
    form.cogsLiPerCall = liStr(cur.cogs_li_per_call)
    form.inputLi = ''
    form.outputLi = ''
    form.upInLi = ''
    form.upCacheLi = ''
    form.upOutLi = ''
  } else {
    form.inputLi = liStr(cur.input_price_li_per_mtok)
    form.outputLi = liStr(cur.output_price_li_per_mtok)
    form.upInLi = liStr(cur.upstream_input_cost_li_per_mtok)
    form.upCacheLi = liStr(cur.upstream_cache_cost_li_per_mtok)
    form.upOutLi = liStr(cur.upstream_output_cost_li_per_mtok)
    form.priceLiPerCall = ''
    form.cogsLiPerCall = ''
  }
  filledFromCurrent.value = true
}

function statusLabel(s: string) {
  if (s === 'current') return '当前'
  if (s === 'history') return '历史'
  if (s === 'scheduled') return '预约'
  return s
}

/** 列表展示：本地可读时间 */
function formatInstant(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Date → datetime-local 值（本地时区，精确到分钟） */
function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** datetime-local → UTC ISO（供 API） */
function datetimeLocalToIsoUtc(local: string): string {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) {
    throw new Error('生效时间无效，请重新选择')
  }
  return d.toISOString()
}

function setEffectiveNow() {
  const d = new Date()
  d.setSeconds(0, 0)
  form.effectiveLocal = toDatetimeLocalValue(d)
}

function setEffectiveTomorrowLocalMidnight() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  form.effectiveLocal = toDatetimeLocalValue(d)
}

async function refresh() {
  loading.value = true
  listError.value = null
  try {
    const resp = await fetchPrices({
      includeHistory: includeHistory.value,
      includeScheduled: true,
    })
    items.value = resp.items ?? []
    asOf.value = resp.as_of ?? ''
    fillFormFromCurrent(form.model)
  } catch (e) {
    items.value = []
    listError.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '加载失败'
  } finally {
    loading.value = false
  }
}

function parseLi(raw: string, label: string): number {
  const t = raw.trim()
  if (t === '') throw new Error(`${label} 不能为空`)
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} 须为非负整数（厘）`)
  return n
}

async function onSubmit() {
  formError.value = null
  formOk.value = null
  if (!form.operator.trim() || !form.note.trim()) {
    formError.value = 'operator 与 note 必填'
    return
  }
  if (!form.effectiveLocal.trim()) {
    formError.value = '请选择生效时间'
    return
  }

  let body: AdminPriceCreateBody
  try {
    const effectiveFrom = datetimeLocalToIsoUtc(form.effectiveLocal)
    if (perCall.value) {
      body = {
        model: TAVILY_SEARCH,
        billing_unit: 'per_call',
        effective_from: effectiveFrom,
        operator: form.operator.trim(),
        note: form.note.trim(),
        price_li_per_call: parseLi(form.priceLiPerCall, '用户价厘/次'),
        cogs_li_per_call: parseLi(form.cogsLiPerCall, 'COGS 厘/次'),
      }
    } else {
      body = {
        model: form.model,
        billing_unit: 'per_mtok',
        effective_from: effectiveFrom,
        operator: form.operator.trim(),
        note: form.note.trim(),
        input_price_li_per_mtok: parseLi(form.inputLi, '输入价'),
        output_price_li_per_mtok: parseLi(form.outputLi, '输出价'),
        upstream_input_cost_li_per_mtok: parseLi(form.upInLi, '上游输入'),
        upstream_cache_cost_li_per_mtok: parseLi(form.upCacheLi, '上游缓存'),
        upstream_output_cost_li_per_mtok: parseLi(form.upOutLi, '上游输出'),
      }
    }
  } catch (e) {
    formError.value = e instanceof Error ? e.message : '表单校验失败'
    return
  }

  submitting.value = true
  try {
    const created = await createPrice(body)
    formOk.value = `已新增 #${created.id} · ${created.model} · ${statusLabel(created.status)}（只 INSERT，无改历史）`
    await refresh()
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

onMounted(() => {
  setEffectiveNow()
  refresh()
})

watch(
  () => form.model,
  (model) => {
    fillFormFromCurrent(model)
  },
)
</script>

<template>
  <div class="page">
    <p class="lead">
      仅新增 <code>effective_from</code> 版本，不改不删历史行。内网可查看 COGS。搜索按次请用厘/次（服务端方案 A 编码）。
    </p>

    <div class="layout">
      <section class="card list-card">
        <div class="row">
          <h2>价目列表</h2>
          <div class="actions">
            <label class="check">
              <input v-model="includeHistory" type="checkbox" @change="refresh" />
              含历史 / 预约
            </label>
            <button type="button" class="btn" :disabled="loading" @click="refresh">刷新</button>
          </div>
        </div>
        <p v-if="asOf" class="meta">as_of = {{ formatInstant(asOf) }}</p>
        <p v-if="loading" class="muted">加载中…</p>
        <p v-else-if="listError" class="err">{{ listError }}</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>单位</th>
                <th>用户价</th>
                <th>COGS</th>
                <th>生效自</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="items.length === 0">
                <td colspan="6" class="muted">暂无价目（请确认库已由 server Flyway 播种，且 admin 已启动）</td>
              </tr>
              <tr v-for="row in items" :key="row.id">
                <td class="mono">{{ row.model }}</td>
                <td>{{ row.billing_unit === 'per_call' ? '元/次' : '元/MTok' }}</td>
                <td class="mono">
                  <template v-if="row.billing_unit === 'per_call'">
                    {{ row.price_yuan_per_call ?? '—' }}
                    <span class="dim">({{ row.price_li_per_call ?? 0 }} 厘/次)</span>
                  </template>
                  <template v-else>
                    in {{ row.input_price_yuan_per_mtok ?? '—' }} /
                    out {{ row.output_price_yuan_per_mtok ?? '—' }}
                  </template>
                </td>
                <td class="mono">
                  <template v-if="row.billing_unit === 'per_call'">
                    {{ row.cogs_yuan_per_call ?? '—' }}
                    <span class="dim">({{ row.cogs_li_per_call ?? 0 }} 厘/次)</span>
                  </template>
                  <template v-else>
                    in {{ row.upstream_input_cost_yuan_per_mtok ?? '—' }} /
                    cache {{ row.upstream_cache_cost_yuan_per_mtok ?? '—' }} /
                    out {{ row.upstream_output_cost_yuan_per_mtok ?? '—' }}
                  </template>
                </td>
                <td class="mono">{{ formatInstant(row.effective_from) }}</td>
                <td>
                  <span class="badge" :data-status="row.status">{{ statusLabel(row.status) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card form-card">
        <h2>新增价目版本</h2>
        <p class="hint">无「编辑历史」入口。operator / note 必填（审计日志，不落价目表）。</p>
        <p v-if="filledFromCurrent" class="fill-hint">已填入该模型当前生效价，改数字后提交即为新版本。</p>
        <p v-else-if="!loading" class="fill-hint warn">暂无该模型的「当前」价，请手工填写。</p>

        <form class="form" @submit.prevent="onSubmit">
          <label>
            <span>模型</span>
            <select v-model="form.model">
              <option v-for="m in DEFAULT_ALLOWED_MODELS" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>

          <div class="field">
            <span class="field-label">生效时间</span>
            <input v-model="form.effectiveLocal" type="datetime-local" step="60" />
            <div class="quick">
              <button type="button" class="btn sm" @click="setEffectiveNow">此刻</button>
              <button type="button" class="btn sm" @click="setEffectiveTomorrowLocalMidnight">明日 0 点</button>
            </div>
            <p v-if="effectiveUtcPreview" class="field-hint">
              按本机时区选择；入库为 UTC：<code>{{ effectiveUtcPreview }}</code>
            </p>
          </div>

          <label>
            <span>操作人 operator</span>
            <input v-model="form.operator" type="text" maxlength="128" autocomplete="username" />
          </label>

          <label>
            <span>原因 note</span>
            <input v-model="form.note" type="text" maxlength="512" placeholder="调价说明" />
          </label>

          <template v-if="perCall">
            <p class="unit-tag">计费单位：厘 / 次 → 服务端 ×1e6 写入 input 列</p>
            <label>
              <span>用户价（厘/次）</span>
              <input v-model="form.priceLiPerCall" type="text" inputmode="numeric" class="mono" />
            </label>
            <label>
              <span>上游 COGS（厘/次）</span>
              <input v-model="form.cogsLiPerCall" type="text" inputmode="numeric" class="mono" />
            </label>
          </template>
          <template v-else>
            <p class="unit-tag">计费单位：厘 / 百万 Token（五档含 COGS）</p>
            <label>
              <span>输入价 input（厘/MTok）</span>
              <input v-model="form.inputLi" type="text" inputmode="numeric" class="mono" />
            </label>
            <label>
              <span>输出价 output（厘/MTok）</span>
              <input v-model="form.outputLi" type="text" inputmode="numeric" class="mono" />
            </label>
            <label>
              <span>上游输入 COGS</span>
              <input v-model="form.upInLi" type="text" inputmode="numeric" class="mono" />
            </label>
            <label>
              <span>上游缓存 COGS</span>
              <input v-model="form.upCacheLi" type="text" inputmode="numeric" class="mono" />
            </label>
            <label>
              <span>上游输出 COGS</span>
              <input v-model="form.upOutLi" type="text" inputmode="numeric" class="mono" />
            </label>
          </template>

          <p v-if="formError" class="err">{{ formError }}</p>
          <p v-if="formOk" class="ok">{{ formOk }}</p>

          <button type="submit" class="btn primary" :disabled="submitting">
            {{ submitting ? '提交中…' : '提交新版本' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 0.75rem;
}

.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1rem;
  align-items: start;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.row h2,
.form-card h2 {
  margin: 0;
  font-size: 1rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.meta {
  margin: 0.35rem 0 0.75rem;
  font-size: 0.8rem;
  color: var(--muted);
  font-family: ui-monospace, Consolas, monospace;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th,
td {
  text-align: left;
  padding: 0.55rem 0.45rem;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.78rem;
  white-space: nowrap;
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.82rem;
}

.dim {
  color: var(--muted);
  font-size: 0.75rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #eef2f6;
  color: var(--muted);
}

.badge[data-status='current'] {
  background: #e3f6ee;
  color: var(--ok);
}

.badge[data-status='scheduled'] {
  background: #eef6ff;
  color: #175cd3;
}

.badge[data-status='history'] {
  background: #f2f4f7;
  color: var(--muted);
}

.hint {
  margin: 0.5rem 0 0.5rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.fill-hint {
  margin: 0 0 1rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: #eef8f4;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
}

.fill-hint.warn {
  background: #fff6ed;
  color: #b54708;
}

.form {
  display: grid;
  gap: 0.7rem;
}

.form label,
.form .field {
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--muted);
}

.field-label {
  color: var(--muted);
}

.form input,
.form select {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  background: #fff;
  color: var(--text);
  font: inherit;
}

.form input.mono {
  font-size: 0.9rem;
}

.form input[type='datetime-local'] {
  min-height: 2.25rem;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.btn.sm {
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
}

.field-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.4;
  word-break: break-all;
}

.unit-tag {
  margin: 0.25rem 0 0;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: #eef8f4;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  margin-top: 0.25rem;
}

.muted {
  color: var(--muted);
}

.err {
  color: var(--danger);
  font-weight: 600;
  margin: 0;
  font-size: 0.88rem;
}

.ok {
  color: var(--ok);
  font-weight: 600;
  margin: 0;
  font-size: 0.88rem;
}

code {
  font-size: 0.85em;
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
