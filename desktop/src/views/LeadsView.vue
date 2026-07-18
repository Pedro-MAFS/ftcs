<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import Icon from '../components/shared/Icon.vue'
import LeadDetailDrawer from '../components/shared/LeadDetailDrawer.vue'
import type { LeadRowDto, LeadsSnapshotDto } from '../types/electron'

const meta = SECTION_META.leads
const router = useRouter()
const { activeProductId } = useWorkspace()

type FilterId = 'all' | 'raw' | 'scored' | 'a' | 'b' | 'c' | 'mail'

const activeFilter = ref<FilterId>('all')
const searchQuery = ref('')
const loading = ref(false)
const actionMessage = ref('')
const snapshot = ref<LeadsSnapshotDto | null>(null)
const selectedId = ref('')
const drawerOpen = ref(false)
const detailLead = ref<LeadRowDto | null>(null)

const emptyStats = {
  total: 0,
  raw: 0,
  scored: 0,
  byTier: { high: 0, medium: 0, low: 0 },
  pendingMail: 0,
}

const stats = computed(() => snapshot.value?.stats ?? emptyStats)
const rows = computed(() => snapshot.value?.rows ?? [])

const subtitle = computed(() => {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  const s = stats.value
  if (s.total === 0) return '暂无线索 · 可在探索页完成 R1 后回来查看'
  return `${s.total} 条 · 原始 ${s.raw} + 已评分 ${s.scored} · 可按状态筛选`
})

const filters = computed(() => {
  const s = stats.value
  return [
    { id: 'all' as const, label: `全部 ${s.total}`, tone: '' },
    { id: 'raw' as const, label: `未评分 ${s.raw}`, tone: 'warning' },
    { id: 'scored' as const, label: `已评分 ${s.scored}`, tone: '' },
    { id: 'a' as const, label: `A 级 ${s.byTier.high}`, tone: '' },
    { id: 'b' as const, label: `B 级 ${s.byTier.medium}`, tone: '' },
    { id: 'c' as const, label: `C 级 ${s.byTier.low}`, tone: '' },
    { id: 'mail' as const, label: `待写邮件 ${s.pendingMail}`, tone: '' },
  ]
})

function matchesFilter(row: LeadRowDto, filter: FilterId): boolean {
  switch (filter) {
    case 'raw':
      return row.phase === 'raw'
    case 'scored':
      return row.phase === 'scored'
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
    row.contactLabel.toLowerCase().includes(q)
  ) {
    return true
  }
  return row.contacts.some((c) => c.value.toLowerCase().includes(q))
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
  return rows.value.filter(
    (row) => matchesFilter(row, filter) && matchesSearch(row, q),
  )
})

async function refreshLeads(): Promise<void> {
  if (!window.ftcs?.listLeads || !activeProductId.value) {
    snapshot.value = null
    return
  }
  loading.value = true
  try {
    snapshot.value = await window.ftcs.listLeads(activeProductId.value)
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

function onScoreClick(): void {
  actionMessage.value = '评分去重将在后续接入 Agent（score-and-dedupe）'
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

function selectRow(row: LeadRowDto): void {
  selectedId.value = row.id
}

watch(activeProductId, () => {
  activeFilter.value = 'all'
  searchQuery.value = ''
  actionMessage.value = ''
  closeDrawer()
  void refreshLeads()
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
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
          class="btn-primary"
          :disabled="!activeProductId"
          title="后续接入 score-and-dedupe"
          @click="onScoreClick"
        >
          评分去重
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
              : '试试切换「全部 / 未评分 / 已评分」或清空搜索'
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
          <span class="table-cell">
            <span
              class="lead-phase"
              :class="row.phase === 'scored' ? 'is-scored' : 'is-raw'"
            >
              {{ row.phase === 'scored' ? '已评分' : '未评分' }}
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
            <template v-if="row.phase === 'raw' && row.matchReason">
              R1 · {{ row.matchReason }}
            </template>
            <template v-else>
              {{ row.matchReason || '—' }}
            </template>
          </span>
          <span class="table-cell">
            <button
              type="button"
              class="leads-table__action"
              @click.stop="openDrawer(row)"
            >
              查看
            </button>
          </span>
        </div>
      </div>
    </div>

    <LeadDetailDrawer
      :open="drawerOpen"
      :lead="detailLead"
      @close="closeDrawer"
    />
  </section>
</template>
