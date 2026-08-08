<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import Icon from '../components/shared/Icon.vue'
import LeadDetailDrawer from '../components/shared/LeadDetailDrawer.vue'
import type { LeadRowDto, LeadsSnapshotDto } from '../types/electron'

const meta = SECTION_META.leads
const route = useRoute()
const router = useRouter()
const {
  activeProductId,
  exploreTasks,
  generating,
  agentSkill,
  agentStatus,
  refreshExploreTasks,
  resetAgentForScoreAndDedupe,
  resetAgentForDraftEmail,
} = useWorkspace()

type FilterId = 'all' | 'raw' | 'scored' | 'discarded' | 'a' | 'b' | 'c' | 'mail'

const activeFilter = ref<FilterId>('all')
/** 空字符串 = 全部探索任务；历史无线索 runId 仅在「全部」时可见 */
const runFilter = ref('')
const searchQuery = ref('')
const loading = ref(false)
const scoring = ref(false)
const drafting = ref(false)
const pendingHighIds = ref<string[]>([])
const actionMessage = ref('')
const snapshot = ref<LeadsSnapshotDto | null>(null)
const selectedId = ref('')
const drawerOpen = ref(false)
const detailLead = ref<LeadRowDto | null>(null)

const emptyStats = {
  total: 0,
  raw: 0,
  scored: 0,
  discarded: 0,
  byTier: { high: 0, medium: 0, low: 0 },
  pendingMail: 0,
}

const stats = computed(() => snapshot.value?.stats ?? emptyStats)
const rows = computed(() => snapshot.value?.rows ?? [])

const isScoring = computed(
  () =>
    scoring.value ||
    (generating.value && agentSkill.value === 'score-and-dedupe'),
)

const isDrafting = computed(
  () =>
    drafting.value ||
    (generating.value && agentSkill.value === 'draft-outreach-email'),
)

const canScore = computed(() => {
  return (
    !!activeProductId.value &&
    !isScoring.value &&
    !isDrafting.value &&
    !generating.value &&
    stats.value.raw > 0
  )
})

const canBatchDraft = computed(() => {
  return (
    !!activeProductId.value &&
    !isScoring.value &&
    !isDrafting.value &&
    !generating.value &&
    pendingHighIds.value.length > 0
  )
})

const runOptions = computed(() => {
  const tasks = (exploreTasks.value?.tasks ?? []).filter(
    (t) => t.status !== 'keywords_ready',
  )
  return tasks.map((t) => ({
    id: t.id,
    label: `${t.title} · ${t.id}`,
  }))
})

const subtitle = computed(() => {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  const s = stats.value
  if (s.total === 0) return '暂无线索 · 可在探索页完成 R1 后回来查看'
  const parts = [`${s.total} 条`, `未评分 ${s.raw}`, `已评分 ${s.scored}`]
  if (s.discarded > 0) parts.push(`淘汰 ${s.discarded}`)
  if (runFilter.value) parts.push(`任务 ${runFilter.value}`)
  return `${parts.join(' · ')} · 可按状态 / 探索任务筛选`
})

const filters = computed(() => {
  const s = stats.value
  return [
    { id: 'all' as const, label: `全部 ${s.total}`, tone: '' },
    { id: 'raw' as const, label: `未评分 ${s.raw}`, tone: 'warning' },
    { id: 'scored' as const, label: `已评分 ${s.scored}`, tone: '' },
    {
      id: 'discarded' as const,
      label: `重复淘汰 ${s.discarded}`,
      tone: 'muted',
    },
    { id: 'a' as const, label: `A 级 ${s.byTier.high}`, tone: '' },
    { id: 'b' as const, label: `B 级 ${s.byTier.medium}`, tone: '' },
    { id: 'c' as const, label: `C 级 ${s.byTier.low}`, tone: '' },
    { id: 'mail' as const, label: `待写邮件 ${s.pendingMail}`, tone: '' },
  ]
})

function phaseLabel(phase: LeadRowDto['phase']): string {
  if (phase === 'scored') return '已评分'
  if (phase === 'discarded') return '重复淘汰'
  return '未评分'
}

function phaseClass(phase: LeadRowDto['phase']): string {
  if (phase === 'scored') return 'is-scored'
  if (phase === 'discarded') return 'is-discarded'
  return 'is-raw'
}

/** 已评分线索的生命周期：new / email_drafted 等 */
function lifecycleLabel(status: string | null | undefined): string {
  if (!status || status === 'new') return ''
  const map: Record<string, string> = {
    reviewed: '已审阅',
    email_drafted: '已写邮件',
    email_approved: '邮件已通过',
    contacted: '已触达',
    replied: '已回复',
    converted: '已转化',
    rejected: '已拒绝',
  }
  return map[status] || status
}

function lifecycleClass(status: string | null | undefined): string {
  if (status === 'email_drafted' || status === 'email_approved') return 'is-mailed'
  if (status === 'contacted' || status === 'replied' || status === 'converted') {
    return 'is-progress'
  }
  if (status === 'rejected') return 'is-rejected'
  return 'is-muted'
}

function hasDrafted(row: LeadRowDto): boolean {
  return (
    row.phase === 'scored' &&
    (row.status === 'email_drafted' ||
      row.status === 'email_approved' ||
      row.status === 'contacted')
  )
}

function matchesFilter(row: LeadRowDto, filter: FilterId): boolean {
  switch (filter) {
    case 'raw':
      return row.phase === 'raw'
    case 'scored':
      return row.phase === 'scored'
    case 'discarded':
      return row.phase === 'discarded'
    case 'a':
      return row.tier === 'high'
    case 'b':
      return row.tier === 'medium'
    case 'c':
      return row.tier === 'low'
    case 'mail':
      return (
        row.phase === 'scored' &&
        (!row.status || row.status === 'new' || row.status === 'reviewed')
      )
    default:
      return true
  }
}

function matchesSearch(row: LeadRowDto, q: string): boolean {
  if (!q) return true
  if (
    row.companyName.toLowerCase().includes(q) ||
    row.domain.toLowerCase().includes(q) ||
    row.country.toLowerCase().includes(q) ||
    row.matchReason.toLowerCase().includes(q) ||
    row.contactLabel.toLowerCase().includes(q) ||
    row.runId.toLowerCase().includes(q)
  ) {
    return true
  }
  return row.contacts.some((c) => c.value.toLowerCase().includes(q))
}

function matchesRun(row: LeadRowDto, runId: string): boolean {
  if (!runId) return true
  return row.runId === runId
}

function applyRunQueryFromRoute(): void {
  const raw = route.query.runId
  const value = typeof raw === 'string' ? raw.trim() : ''
  runFilter.value = value
}

function contactTitle(row: LeadRowDto): string {
  if (row.contacts.length === 0) return ''
  return row.contacts.map((c) => `${c.type}: ${c.value}`).join('\n')
}

function websiteUrl(row: LeadRowDto): string {
  if (row.domain) {
    return row.domain.startsWith('http') ? row.domain : `https://${row.domain}`
  }
  return row.sourceUrl || ''
}

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const filter = activeFilter.value
  const runId = runFilter.value
  return rows.value.filter(
    (row) =>
      matchesFilter(row, filter) &&
      matchesRun(row, runId) &&
      matchesSearch(row, q),
  )
})

async function refreshLeads(): Promise<void> {
  if (!window.ftcs?.listLeads || !activeProductId.value) {
    snapshot.value = null
    pendingHighIds.value = []
    return
  }
  loading.value = true
  try {
    void refreshExploreTasks()
    snapshot.value = await window.ftcs.listLeads(activeProductId.value)
    if (window.ftcs.listEmailDrafts) {
      const emails = await window.ftcs.listEmailDrafts(activeProductId.value)
      pendingHighIds.value = emails.pendingHighLeadIds ?? []
    }
    if (
      selectedId.value &&
      !snapshot.value.rows.some((r) => r.id === selectedId.value)
    ) {
      selectedId.value = ''
    }
    if (
      detailLead.value &&
      !snapshot.value.rows.some((r) => r.id === detailLead.value?.id)
    ) {
      closeDrawer()
    } else if (detailLead.value) {
      const latest = snapshot.value.rows.find((r) => r.id === detailLead.value?.id)
      if (latest) detailLead.value = latest
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    snapshot.value = null
  } finally {
    loading.value = false
  }
}

async function onScoreClick(): Promise<void> {
  if (!activeProductId.value || !window.ftcs?.scoreAndDedupeLeads) return
  if (stats.value.raw <= 0) {
    actionMessage.value = '暂无未评分原始线索，请先完成 R1 探索'
    return
  }
  if (generating.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }

  const preflightError = await ensureAgentReady('score-and-dedupe')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  scoring.value = true
  actionMessage.value = ''
  resetAgentForScoreAndDedupe(stats.value.raw)

  try {
    const res = await window.ftcs.scoreAndDedupeLeads(activeProductId.value)
    if (!res.ok) {
      actionMessage.value = res.message
      agentStatus.value = 'error'
      return
    }
    actionMessage.value = res.message
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    agentStatus.value = 'error'
  } finally {
    scoring.value = false
  }
}

async function startDraftEmails(leadIds?: string[]): Promise<void> {
  if (!activeProductId.value || !window.ftcs?.draftEmails) return
  if (generating.value || isDrafting.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }

  const targetCount = leadIds?.length ?? pendingHighIds.value.length
  if (!leadIds && targetCount <= 0) {
    actionMessage.value = '暂无待起草的 high 线索'
    return
  }

  const preflightError = await ensureAgentReady('draft-email')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  drafting.value = true
  actionMessage.value = ''
  resetAgentForDraftEmail(targetCount)

  try {
    const res = await window.ftcs.draftEmails({
      productId: activeProductId.value,
      leadIds,
    })
    if (!res.ok) {
      actionMessage.value = res.message
      agentStatus.value = 'error'
      return
    }
    actionMessage.value = res.message
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    agentStatus.value = 'error'
  } finally {
    drafting.value = false
  }
}

function onBatchDraftClick(): void {
  void startDraftEmails()
}

function onDraftLead(lead: LeadRowDto): void {
  if (lead.phase !== 'scored') {
    actionMessage.value = '仅已评分线索可写邮件'
    return
  }
  void startDraftEmails([lead.id])
}

function goEmail(): void {
  router.push({ name: 'email' }).catch(() => undefined)
}

function goEmailLead(lead: LeadRowDto): void {
  router
    .push({ name: 'email', query: { leadId: lead.id } })
    .catch(() => undefined)
}

function goExplore(): void {
  router.push({ name: 'explore' }).catch(() => undefined)
}

function openDrawer(row: LeadRowDto): void {
  selectedId.value = row.id
  detailLead.value = row
  drawerOpen.value = true
}

function closeDrawer(): void {
  drawerOpen.value = false
  detailLead.value = null
}

async function onLeadSaved(lead: LeadRowDto): Promise<void> {
  detailLead.value = lead
  selectedId.value = lead.id
  await refreshLeads()
  const latest = snapshot.value?.rows.find((r) => r.id === lead.id)
  if (latest) detailLead.value = latest
}

function selectRow(row: LeadRowDto): void {
  selectedId.value = row.id
}

function onRunFilterChange(): void {
  const next = runFilter.value.trim()
  const current =
    typeof route.query.runId === 'string' ? route.query.runId.trim() : ''
  if (next === current) return
  const query = { ...route.query }
  if (next) query.runId = next
  else delete query.runId
  router.replace({ name: 'leads', query }).catch(() => undefined)
}

watch(activeProductId, () => {
  activeFilter.value = 'all'
  runFilter.value = ''
  searchQuery.value = ''
  actionMessage.value = ''
  closeDrawer()
  if (route.query.runId) {
    router.replace({ name: 'leads', query: {} }).catch(() => undefined)
  }
  void refreshLeads()
})

watch(
  () => route.query.runId,
  () => {
    applyRunQueryFromRoute()
  },
)

watch(agentStatus, (status) => {
  if (
    (status === 'done' || status === 'error') &&
    agentSkill.value === 'score-and-dedupe'
  ) {
    void refreshLeads().then(() => {
      if (status === 'done' && stats.value.scored > 0) {
        activeFilter.value = 'scored'
      }
    })
  }
  if (
    (status === 'done' || status === 'error') &&
    agentSkill.value === 'draft-outreach-email'
  ) {
    void refreshLeads().then(() => {
      if (status === 'done') goEmail()
    })
  }
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  applyRunQueryFromRoute()
  void refreshLeads()
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshLeads()
  }, 8000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canBatchDraft"
          :title="
            pendingHighIds.length > 0
              ? `为 ${pendingHighIds.length} 条 high 线索批量起草`
              : '暂无待起草的 high 线索'
          "
          @click="onBatchDraftClick"
        >
          {{ isDrafting ? '起草中…' : `批量起草${pendingHighIds.length ? ` ${pendingHighIds.length}` : ''}` }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canScore"
          :title="
            stats.raw > 0
              ? '对原始线索执行 score-and-dedupe'
              : '需要先有未评分的原始线索'
          "
          @click="onScoreClick"
        >
          {{ isScoring ? '评分中…' : '评分去重' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!activeProductId"
          @click="goExplore"
        >
          <Icon name="play" :size="12" />
          一键 R1
        </button>
      </div>
    </header>

    <p v-if="actionMessage" class="leads-banner">{{ actionMessage }}</p>

    <div class="filter-row">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="filter-chip"
        :class="{
          'is-active': activeFilter === f.id,
          'is-warning': f.tone === 'warning' && activeFilter !== f.id,
        }"
        @click="activeFilter = f.id"
      >
        {{ f.label }}
      </button>
      <div class="filter-spacer" />
      <select
        v-model="runFilter"
        class="text-input filter-run-select"
        aria-label="按探索任务筛选"
        @change="onRunFilterChange"
      >
        <option value="">全部探索任务</option>
        <option v-for="opt in runOptions" :key="opt.id" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>
      <div class="search-box search-box--input">
        <Icon name="search" :size="12" />
        <input
          v-model="searchQuery"
          type="search"
          aria-label="搜索域名或公司"
          placeholder="搜索域名 / 公司"
        />
      </div>
    </div>

    <div class="table-shell leads-table">
      <div class="leads-table__header">
        <span class="table-cell">公司</span>
        <span class="table-cell">状态</span>
        <span class="table-cell">域名</span>
        <span class="table-cell">国家</span>
        <span class="table-cell">联系方式</span>
        <span class="table-cell">Tier</span>
        <span class="table-cell">评分</span>
        <span class="table-cell">匹配理由</span>
        <span class="table-cell">操作</span>
      </div>

      <div v-if="loading && !snapshot" class="table-empty">
        <p>加载线索中…</p>
      </div>
      <div v-else-if="!activeProductId" class="table-empty">
        <p>未选择产品</p>
        <p class="muted">在左侧产品列表中选择后再查看线索</p>
      </div>
      <div v-else-if="filteredRows.length === 0" class="table-empty">
        <p>{{ rows.length === 0 ? '暂无线索' : '当前筛选无结果' }}</p>
        <p class="muted">
          {{
            rows.length === 0
              ? '前往探索页启动 R1，原始线索将出现在此'
              : runFilter
                ? '当前探索任务下无匹配线索（历史无线索无 run_id，不会出现在此筛选）'
                : '试试切换「全部 / 未评分 / 已评分 / 重复淘汰」、探索任务或清空搜索'
          }}
        </p>
      </div>
      <div v-else class="leads-table__body">
        <div
          v-for="row in filteredRows"
          :key="row.id"
          class="leads-table__row"
          :class="{ 'is-selected': selectedId === row.id }"
          @click="selectRow(row)"
        >
          <span class="table-cell leads-table__company" :title="row.companyName">
            {{ row.companyName }}
          </span>
          <span class="table-cell leads-table__status">
            <span class="lead-phase" :class="phaseClass(row.phase)">
              {{ phaseLabel(row.phase) }}
            </span>
            <span
              v-if="lifecycleLabel(row.status)"
              class="lead-lifecycle"
              :class="lifecycleClass(row.status)"
            >
              {{ lifecycleLabel(row.status) }}
            </span>
          </span>
          <span class="table-cell leads-table__mono">
            <a
              v-if="websiteUrl(row)"
              class="lead-link"
              :href="websiteUrl(row)"
              target="_blank"
              rel="noopener noreferrer"
              :title="websiteUrl(row)"
              @click.stop
            >
              {{ row.domain || websiteUrl(row) }}
            </a>
            <span v-else>—</span>
          </span>
          <span class="table-cell leads-table__mono">{{ row.country || '—' }}</span>
          <span
            class="table-cell leads-table__contact"
            :title="contactTitle(row)"
          >
            {{ row.contactLabel || '—' }}
          </span>
          <span class="table-cell">
            <span
              v-if="row.tierLabel"
              class="lead-tier"
              :class="`is-${row.tier}`"
            >
              {{ row.tierLabel }}
            </span>
            <span v-else class="leads-table__dash">—</span>
          </span>
          <span class="table-cell leads-table__score">
            {{ row.score != null ? row.score : '—' }}
          </span>
          <span class="table-cell leads-table__reason" :title="row.matchReason">
            <template v-if="row.phase === 'discarded'">
              保留 {{ row.keptLeadId || '—' }}
              <template v-if="row.matchReason"> · {{ row.matchReason }}</template>
            </template>
            <template v-else-if="row.phase === 'raw' && row.matchReason">
              R1 · {{ row.matchReason }}
            </template>
            <template v-else>
              {{ row.matchReason || '—' }}
            </template>
          </span>
          <span class="table-cell leads-table__actions">
            <button
              type="button"
              class="leads-table__action"
              @click.stop="openDrawer(row)"
            >
              查看
            </button>
            <button
              v-if="hasDrafted(row)"
              type="button"
              class="leads-table__action"
              title="跳转到该线索的开发信"
              @click.stop="goEmailLead(row)"
            >
              邮件
            </button>
            <button
              v-if="row.phase === 'scored'"
              type="button"
              class="leads-table__action"
              :disabled="isDrafting || generating"
              :title="hasDrafted(row) ? '重新生成开发信草稿' : '生成开发信草稿'"
              @click.stop="onDraftLead(row)"
            >
              {{ hasDrafted(row) ? '重写邮件' : '写邮件' }}
            </button>
          </span>
        </div>
      </div>
    </div>

    <LeadDetailDrawer
      :open="drawerOpen"
      :lead="detailLead"
      :drafting="isDrafting || generating"
      @close="closeDrawer"
      @saved="onLeadSaved"
      @draft="onDraftLead"
      @open-email="goEmailLead"
    />
  </section>
</template>
