<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { AdminApiError } from '@/api/client'
import {
  fetchDashboardSeries,
  fetchDashboardSummary,
  type AdminDashboardSeries,
  type AdminDashboardSummary,
} from '@/api/dashboard'

const POLL_MS = 60_000
const DAYS = 30 as const

const loading = ref(false)
const error = ref<string | null>(null)
const summary = ref<AdminDashboardSummary | null>(null)
const growth = ref<AdminDashboardSeries | null>(null)
const topupSeries = ref<AdminDashboardSeries | null>(null)
const chargeSeries = ref<AdminDashboardSeries | null>(null)

const growthEl = ref<HTMLDivElement | null>(null)
const financeEl = ref<HTMLDivElement | null>(null)
const growthChart = shallowRef<echarts.ECharts | null>(null)
const financeChart = shallowRef<echarts.ECharts | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

const asOfLabel = computed(() => {
  if (!summary.value?.as_of) return ''
  try {
    return new Date(summary.value.as_of).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return summary.value.as_of
  }
})

function formatYuan(v?: number | string | null) {
  if (v == null || v === '') return '0.000'
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(3)
}

function formatRatio(v?: number | string | null) {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function deltaUsers(s: AdminDashboardSummary) {
  const today = s.users.today_new ?? 0
  const y = s.users.yesterday_new
  if (y == null) return `今日新增 ${today}`
  const d = today - y
  const sign = d > 0 ? '+' : ''
  return `今日 +${today} · 较昨日 ${sign}${d}`
}

async function refresh() {
  loading.value = true
  try {
    const [sum, g, t, c] = await Promise.all([
      fetchDashboardSummary(),
      fetchDashboardSeries('user_growth', DAYS),
      fetchDashboardSeries('topup', DAYS),
      fetchDashboardSeries('charge', DAYS),
    ])
    summary.value = sum
    growth.value = g
    topupSeries.value = t
    chargeSeries.value = c
    error.value = null
    renderCharts()
  } catch (e) {
    error.value = e instanceof AdminApiError ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function ensureCharts() {
  if (growthEl.value && !growthChart.value) {
    growthChart.value = echarts.init(growthEl.value)
  }
  if (financeEl.value && !financeChart.value) {
    financeChart.value = echarts.init(financeEl.value)
  }
}

function renderCharts() {
  ensureCharts()
  const days = growth.value?.points?.map((p) => p.day.slice(5)) ?? []
  const growthUsers = growth.value?.points?.map((p) => p.users ?? 0) ?? []
  const topupYuan =
    topupSeries.value?.points?.map((p) => {
      const v = p.value_yuan
      return typeof v === 'number' ? v : Number(v ?? 0)
    }) ?? []
  const chargeYuan =
    chargeSeries.value?.points?.map((p) => {
      const v = p.value_yuan
      return typeof v === 'number' ? v : Number(v ?? 0)
    }) ?? []

  growthChart.value?.setOption({
    color: ['#2563eb'],
    grid: { left: 40, right: 16, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: '日新增',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.08 },
        data: growthUsers,
      },
    ],
  })

  financeChart.value?.setOption({
    color: ['#059669', '#d97706'],
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    legend: { data: ['充值', '消费'], top: 0 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days },
    yAxis: { type: 'value', name: '元' },
    series: [
      { name: '充值', type: 'line', smooth: true, showSymbol: false, data: topupYuan },
      { name: '消费', type: 'line', smooth: true, showSymbol: false, data: chargeYuan },
    ],
  })
}

function onResize() {
  growthChart.value?.resize()
  financeChart.value?.resize()
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    void refresh()
  }
}

watch([growthEl, financeEl], () => {
  if (summary.value) renderCharts()
})

onMounted(() => {
  void refresh()
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refresh()
  }, POLL_MS)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
  growthChart.value?.dispose()
  financeChart.value?.dispose()
})
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h2>运营大屏</h2>
        <p class="muted">用户增长 · 充值 · 消费 · 活跃概览（Asia/Shanghai 业务日）</p>
      </div>
      <div class="head-meta">
        <span v-if="asOfLabel" class="muted tiny">更新于 {{ asOfLabel }}</span>
        <button type="button" class="btn" :disabled="loading" @click="refresh">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="err">{{ error }}（已保留上次成功数据）</p>

    <section class="metrics">
      <div class="metric">
        <div class="label">注册用户</div>
        <div class="value mono">{{ summary?.users.total ?? '—' }}</div>
        <div class="hint">{{ summary ? deltaUsers(summary) : '加载中…' }}</div>
      </div>
      <div class="metric">
        <div class="label">今日充值（元）</div>
        <div class="value mono">{{ summary ? formatYuan(summary.topup.today_amount_yuan) : '—' }}</div>
        <div class="hint">
          {{ summary ? `${summary.topup.today_count} 笔` : '—' }}
          <span v-if="summary?.topup.adjust_today_amount_yuan != null" class="dim">
            · 今日调账 {{ formatYuan(summary.topup.adjust_today_amount_yuan) }}
          </span>
        </div>
      </div>
      <div class="metric">
        <div class="label">今日消费（元）</div>
        <div class="value mono">{{ summary ? formatYuan(summary.charge.today_amount_yuan) : '—' }}</div>
        <div class="hint">
          {{ summary ? `${summary.charge.today_count} 笔` : '—' }}
          <span v-if="summary" class="dim">
            · 成本 {{ formatYuan(summary.charge.today_cogs_yuan) }} · 毛利
            {{ formatYuan(summary.charge.today_margin_yuan) }}
          </span>
        </div>
      </div>
      <div class="metric">
        <div class="label">近 7 日活跃</div>
        <div class="value mono">{{ summary?.active.wau ?? '—' }}</div>
        <div class="hint">
          {{ summary ? `今日 DAU ${summary.active.dau} · 占比 ${formatRatio(summary.active.wau_ratio)}` : '—' }}
        </div>
      </div>
    </section>

    <section class="charts">
      <div class="chart-card">
        <h3>近 {{ DAYS }} 日用户增长</h3>
        <div ref="growthEl" class="chart" />
      </div>
      <div class="chart-card">
        <h3>近 {{ DAYS }} 日充值 vs 消费（元）</h3>
        <div ref="financeEl" class="chart" />
      </div>
    </section>
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
.head-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.metric {
  background: var(--panel, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 14px 16px;
}
.label {
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.value {
  margin-top: 6px;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted, #6b7280);
}
.dim {
  opacity: 0.85;
}
.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 320px;
}
.chart-card {
  background: var(--panel, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 14px 16px 10px;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}
.chart-card h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.chart {
  flex: 1;
  min-height: 260px;
  width: 100%;
}
.btn {
  border: 1px solid var(--border, #d1d5db);
  background: #fff;
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font: inherit;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.muted {
  color: var(--muted, #6b7280);
  margin: 0;
}
.tiny {
  font-size: 12px;
}
.err {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}
@media (max-width: 1100px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
