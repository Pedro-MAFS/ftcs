<script setup lang="ts">
import { computed, watch } from 'vue'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import Icon from '../components/shared/Icon.vue'

const meta = SECTION_META.profile
const {
  currentProfile,
  activeProductId,
  generating,
  agentStatus,
  loadActiveProfile,
  refreshProducts,
} = useWorkspace()

const readinessLabel = computed(() => {
  if (generating.value) return '生成中…'
  const p = currentProfile.value
  if (!p) return '—'
  return p.readinessScore != null ? String(p.readinessScore) : '—'
})

const statusLabel = computed(() => currentProfile.value?.status ?? '未生成')

const company = computed(() => {
  const raw = currentProfile.value?.raw?.company
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
})

const products = computed(() => {
  const list = currentProfile.value?.raw?.products
  return Array.isArray(list) ? list : []
})

const firstProduct = computed(() => {
  const p = products.value[0]
  if (!p || typeof p !== 'object') return null
  return p as Record<string, unknown>
})

const buyers = computed(() => {
  const list = currentProfile.value?.raw?.buyer_personas
  return Array.isArray(list) ? list : []
})

const markets = computed(() => {
  const raw = currentProfile.value?.raw?.target_markets
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
})

const fieldRows = computed(() => {
  const product = firstProduct.value
  const buyer = buyers.value[0] as Record<string, unknown> | undefined
  const regions = Array.isArray(markets.value?.regions)
    ? (markets.value!.regions as unknown[]).join(', ')
    : '—'
  const certs = Array.isArray(company.value?.certifications)
    ? (company.value!.certifications as unknown[]).join(', ')
    : '—'
  const useCases = Array.isArray(product?.use_cases)
    ? (product!.use_cases as unknown[]).join(', ')
    : '—'
  const diffs = Array.isArray(product?.differentiators)
    ? (product!.differentiators as unknown[]).join(', ')
    : '—'
  const companyTypes = Array.isArray(buyer?.company_types)
    ? (buyer!.company_types as unknown[]).join(', ')
    : buyer?.role
      ? String(buyer.role)
      : '—'

  return [
    { label: '产品名称', value: String(product?.name || product?.name_en || '—') },
    { label: '品类', value: String(product?.category || '—') },
    { label: '应用场景', value: useCases || '—' },
    { label: '目标买家', value: companyTypes || '—' },
    { label: '目标市场', value: regions || '—' },
    { label: '认证', value: certs || '—' },
    { label: '差异化卖点', value: diffs || '—' },
    {
      label: '公司',
      value: String(company.value?.name || '—'),
    },
  ]
})

watch(
  activeProductId,
  () => {
    void loadActiveProfile()
  },
  { immediate: true },
)

async function reload(): Promise<void> {
  await refreshProducts()
  await loadActiveProfile()
}
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" :disabled="generating" @click="reload">
          刷新
        </button>
        <button type="button" class="btn-primary" disabled title="下一步：expand-keywords">
          <Icon name="save" :size="12" />
          保存并扩展
        </button>
      </div>
    </header>

    <div class="profile-panel">
      <div
        class="ready-banner"
        :class="{
          'is-ready': currentProfile?.status === 'ready',
          'is-running': generating,
        }"
      >
        <span>就绪度 {{ readinessLabel }}</span>
        <span class="ready-banner__sep">·</span>
        <span>{{ statusLabel }}</span>
        <span v-if="activeProductId" class="mono muted">{{ activeProductId }}</span>
      </div>

      <p v-if="generating" class="library-feedback ok">
        Agent 正在执行 extract-product-profile，请查看右侧日志。完成后将自动刷新本页。
      </p>
      <p v-else-if="agentStatus === 'error'" class="library-feedback err">
        生成失败，请查看右侧 Agent 日志后重试。
      </p>
      <p v-else-if="!currentProfile" class="library-feedback muted">
        尚未生成画像。请到「录入」勾选网站/文件后点击「生成画像」。
      </p>

      <div v-if="currentProfile" class="field-grid">
        <div v-for="row in fieldRows" :key="row.label" class="field-skel">
          <span>{{ row.label }}</span>
          <div class="input-skeleton profile-field-value">{{ row.value }}</div>
        </div>
      </div>

      <div v-if="currentProfile?.missingFields?.length" class="profile-missing">
        <div class="field-label">缺失字段</div>
        <ul>
          <li v-for="f in currentProfile.missingFields" :key="f">{{ f }}</li>
        </ul>
      </div>
    </div>
  </section>
</template>
