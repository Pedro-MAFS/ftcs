<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import type { ExploreR2SiteDto, KeywordExpansionDto } from '../../types/electron'
import { ROUND_FILTER_OPTIONS, ROUND_SELECT_OPTIONS } from '../../explore/round-labels'

export type QueryDraft = {
  key: string
  id: string
  query: string
  dimension: string
  language: string
  priority: string
  round: string
  site_id?: string
}

const props = defineProps<{
  open: boolean
  productId: string
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: [expansion: KeywordExpansionDto]
}>()

const DIMENSION_OPTIONS = [
  { value: 'product', label: '产品' },
  { value: 'scenario', label: '场景' },
  { value: 'buyer', label: '买家' },
  { value: 'geo', label: '地理' },
  { value: 'competitor', label: '竞品' },
]

const PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const rows = ref<QueryDraft[]>([])
const r2Sites = ref<ExploreR2SiteDto[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const filterRound = ref('all')
const filterDimension = ref('all')
let seq = 0

function nextKey(): string {
  seq += 1
  return `row_${seq}_${Date.now()}`
}

function toDrafts(expansion: KeywordExpansionDto): QueryDraft[] {
  return expansion.search_queries.map((q) => ({
    key: nextKey(),
    id: q.id,
    query: q.query,
    dimension: q.dimension || 'product',
    language: q.language || 'en',
    priority: q.priority || 'medium',
    round: q.round || 'R1',
    site_id: q.site_id,
  }))
}

const visibleRows = computed(() => {
  return rows.value.filter((row) => {
    if (filterRound.value !== 'all' && row.round !== filterRound.value) return false
    if (filterDimension.value !== 'all' && row.dimension !== filterDimension.value) {
      return false
    }
    return true
  })
})

const validCount = computed(
  () => rows.value.filter((r) => r.query.trim()).length,
)

async function loadSites(): Promise<void> {
  if (!window.ftcs?.getExploreR2Sites) return
  try {
    const res = await window.ftcs.getExploreR2Sites()
    if (res.ok) r2Sites.value = res.sites
  } catch {
    // ignore
  }
}

async function load(): Promise<void> {
  if (!props.productId || !window.ftcs?.getKeywords) return
  loading.value = true
  error.value = ''
  try {
    await loadSites()
    const expansion = await window.ftcs.getKeywords(props.productId)
    if (!expansion) {
      rows.value = []
      error.value = '未找到关键词扩展结果'
      return
    }
    rows.value = toDrafts(expansion)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function onRoundChange(row: QueryDraft): void {
  if (row.round !== 'R2') {
    row.site_id = undefined
  }
}

function addRow(): void {
  const round = filterRound.value === 'all' ? 'R1' : filterRound.value
  rows.value.push({
    key: nextKey(),
    id: '',
    query: '',
    dimension: filterDimension.value === 'all' ? 'product' : filterDimension.value,
    language: 'en',
    priority: 'medium',
    round,
    site_id: round === 'R2' ? r2Sites.value[0]?.id : undefined,
  })
}

function removeRow(key: string): void {
  rows.value = rows.value.filter((r) => r.key !== key)
}

async function save(): Promise<void> {
  if (!props.productId || !window.ftcs?.saveKeywords || saving.value) return
  if (validCount.value === 0) {
    error.value = '至少保留一条有效搜索词'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const res = await window.ftcs.saveKeywords({
      productId: props.productId,
      search_queries: rows.value.map((r) => ({
        id: r.id || undefined,
        query: r.query,
        dimension: r.dimension,
        language: r.language,
        priority: r.priority,
        round: r.round,
        ...(r.round === 'R2' && r.site_id ? { site_id: r.site_id } : {}),
      })),
    })
    if (!res.ok || !res.expansion) {
      error.value = res.message || '保存失败'
      return
    }
    emit('saved', res.expansion)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open || saving.value || props.busy) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) void load()
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="kw-editor"
      role="dialog"
      aria-modal="true"
      aria-label="编辑关键词"
    >
      <button type="button" class="kw-editor__backdrop" aria-label="关闭" @click="emit('close')" />
      <div class="kw-editor__panel">
        <header class="kw-editor__head">
          <div>
            <h2>编辑关键词</h2>
            <p>
              调整搜索词后保存，将写入 expansion.json · 有效
              {{ validCount }} / {{ rows.length }} 条
            </p>
          </div>
          <div class="kw-editor__filters">
            <select v-model="filterRound" class="text-input kw-editor__select">
              <option
                v-for="opt in ROUND_FILTER_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <select v-model="filterDimension" class="text-input kw-editor__select">
              <option value="all">全部维度</option>
              <option
                v-for="d in DIMENSION_OPTIONS"
                :key="d.value"
                :value="d.value"
              >
                {{ d.label }}
              </option>
            </select>
          </div>
        </header>

        <p v-if="error" class="kw-editor__error">{{ error }}</p>
        <p v-else-if="loading" class="kw-editor__hint">加载中…</p>

        <div v-else class="kw-editor__table-wrap">
          <table class="kw-editor__table">
            <thead>
              <tr>
                <th class="kw-col-query">搜索词</th>
                <th class="kw-col-dim">维度</th>
                <th class="kw-col-round">轮次</th>
                <th class="kw-col-site">站点</th>
                <th class="kw-col-pri">优先级</th>
                <th class="kw-col-act" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.key">
                <td>
                  <input
                    v-model="row.query"
                    class="text-input"
                    type="text"
                    placeholder="例如 industrial valve distributor Europe"
                  />
                </td>
                <td>
                  <select v-model="row.dimension" class="text-input">
                    <option
                      v-for="d in DIMENSION_OPTIONS"
                      :key="d.value"
                      :value="d.value"
                    >
                      {{ d.label }}
                    </option>
                  </select>
                </td>
                <td>
                  <select
                    v-model="row.round"
                    class="text-input"
                    @change="onRoundChange(row)"
                  >
                    <option
                      v-for="opt in ROUND_SELECT_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </td>
                <td>
                  <select
                    v-if="row.round === 'R2'"
                    v-model="row.site_id"
                    class="text-input"
                  >
                    <option value="">选择站点</option>
                    <option
                      v-for="site in r2Sites"
                      :key="site.id"
                      :value="site.id"
                    >
                      {{ site.label }}
                    </option>
                  </select>
                  <span v-else class="kw-editor__dash">—</span>
                </td>
                <td>
                  <select v-model="row.priority" class="text-input">
                    <option
                      v-for="p in PRIORITY_OPTIONS"
                      :key="p.value"
                      :value="p.value"
                    >
                      {{ p.label }}
                    </option>
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    class="icon-btn"
                    title="删除"
                    :disabled="rows.length <= 1"
                    @click="removeRow(row.key)"
                  >
                    <Icon name="trash" :size="13" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!visibleRows.length" class="kw-editor__hint">当前筛选下无搜索词</p>
        </div>

        <footer class="kw-editor__foot">
          <button
            type="button"
            class="btn-secondary"
            :disabled="loading || saving"
            @click="addRow"
          >
            <Icon name="plus" :size="12" />
            添加搜索词
          </button>
          <div class="kw-editor__foot-actions">
            <button
              type="button"
              class="btn-secondary"
              :disabled="saving"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="loading || saving || validCount === 0"
              @click="save"
            >
              <Icon name="save" :size="12" />
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
