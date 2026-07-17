<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

/** 当前展开的产品索引；默认首项 */
const expandedIndex = ref(0)

const ROLE_LABELS: Record<string, string> = {
  procurement_manager: '采购经理',
  project_contractor: '工程承包商',
  distributor: '分销商',
  importer: '进口商',
  oem: 'OEM',
}

const COMPANY_TYPE_LABELS: Record<string, string> = {
  distributor: '分销商',
  importer: '进口商',
  wholesaler: '批发商',
  building_material_chain: '建材连锁',
  OEM: 'OEM',
  oem: 'OEM',
  construction: '建筑商',
  landscape_design: '景观设计',
  real_estate_developer: '地产开发',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function joinList(value: unknown, sep = ' · '): string {
  if (!Array.isArray(value) || value.length === 0) return ''
  return value.map(String).filter(Boolean).join(sep)
}

function displayOrDash(value: string): string {
  return value.trim() ? value : '—'
}

const readinessLabel = computed(() => {
  if (generating.value) return '生成中…'
  const p = currentProfile.value
  if (!p) return '—'
  return p.readinessScore != null ? `${p.readinessScore}%` : '—'
})

const statusLabel = computed(() => currentProfile.value?.status ?? '未生成')

const company = computed(() => asRecord(currentProfile.value?.raw?.company))

const companyName = computed(() => String(company.value?.name || '—'))
const companyWebsite = computed(() => String(company.value?.website || '—'))
const companyCountry = computed(() => String(company.value?.country || '—'))
const companyDescription = computed(() =>
  displayOrDash(String(company.value?.description || '')),
)
const certifications = computed(() => {
  const list = company.value?.certifications
  return Array.isArray(list) ? list.map(String).filter(Boolean) : []
})

const productItems = computed(() => {
  const list = currentProfile.value?.raw?.products
  if (!Array.isArray(list)) return []
  return list.map((item, index) => {
    const row = asRecord(item) ?? {}
    const name = String(row.name || row.name_en || `产品 ${index + 1}`)
    const nameEn = String(row.name_en || '')
    const category = String(row.category || '')
    const materials = joinList(row.materials)
    const useCases = joinList(row.use_cases)
    const differentiators = joinList(row.differentiators)
    const specs = joinList(row.specs)
    return {
      index,
      seq: String(index + 1).padStart(2, '0'),
      name,
      nameEn,
      category,
      materials,
      useCases,
      differentiators,
      specs,
      compactMeta: [nameEn, useCases].filter(Boolean).join('  ·  ') || category || '—',
    }
  })
})

const buyers = computed(() => {
  const list = currentProfile.value?.raw?.buyer_personas
  return Array.isArray(list) ? list.map(asRecord).filter(Boolean) : []
})

const markets = computed(() => asRecord(currentProfile.value?.raw?.target_markets))

const marketRegions = computed(() =>
  displayOrDash(joinList(markets.value?.regions)),
)

const buyerRoles = computed(() => {
  const roles = buyers.value
    .map((b) => {
      const role = String(b?.role || '')
      return ROLE_LABELS[role] || role
    })
    .filter(Boolean)
  return displayOrDash(roles.join(' · '))
})

const buyerCompanyTypes = computed(() => {
  const types = new Set<string>()
  for (const b of buyers.value) {
    const list = b?.company_types
    if (!Array.isArray(list)) continue
    for (const t of list) {
      const key = String(t)
      types.add(COMPANY_TYPE_LABELS[key] || key)
    }
  }
  return displayOrDash([...types].join(' · '))
})

watch(
  activeProductId,
  () => {
    expandedIndex.value = 0
    void loadActiveProfile()
  },
  { immediate: true },
)

watch(productItems, (items) => {
  if (expandedIndex.value >= items.length) {
    expandedIndex.value = items.length > 0 ? 0 : -1
  }
})

function toggleProduct(index: number): void {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

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

      <template v-if="currentProfile">
        <section class="profile-section">
          <h2 class="profile-section__title">公司信息</h2>
          <div class="profile-company-grid">
            <div class="profile-field profile-field--grow">
              <span class="profile-field__label">公司名称</span>
              <div class="profile-field__value">{{ companyName }}</div>
            </div>
            <div class="profile-field profile-field--grow">
              <span class="profile-field__label">官网</span>
              <div class="profile-field__value profile-field__value--link">
                {{ companyWebsite }}
              </div>
            </div>
            <div class="profile-field profile-field--country">
              <span class="profile-field__label">国家</span>
              <div class="profile-field__value">{{ companyCountry }}</div>
            </div>
          </div>
          <div class="profile-field">
            <span class="profile-field__label">公司简介</span>
            <div class="profile-field__value profile-field__value--multiline">
              {{ companyDescription }}
            </div>
          </div>
          <div class="profile-field">
            <span class="profile-field__label">认证资质</span>
            <div v-if="certifications.length" class="profile-chips">
              <span
                v-for="cert in certifications"
                :key="cert"
                class="profile-chip"
              >{{ cert }}</span>
            </div>
            <div v-else class="profile-field__value">—</div>
          </div>
        </section>

        <section class="profile-section">
          <div class="profile-section__head">
            <h2 class="profile-section__title">产品列表</h2>
            <span class="profile-section__meta">
              {{ productItems.length ? `共 ${productItems.length} 个` : '暂无产品' }}
              <template v-if="productItems.length"> · 点击展开详情</template>
            </span>
          </div>

          <div v-if="!productItems.length" class="profile-empty">暂无产品条目</div>
          <div v-else class="profile-products">
            <button
              v-for="item in productItems"
              :key="`${item.seq}-${item.name}`"
              type="button"
              class="profile-product"
              :class="{ 'is-expanded': expandedIndex === item.index }"
              @click="toggleProduct(item.index)"
            >
              <template v-if="expandedIndex === item.index">
                <span class="profile-product__badge mono">{{ item.seq }} · 展开</span>
                <span class="profile-product__name">{{ item.name }}</span>
                <span v-if="item.nameEn" class="profile-product__en">{{ item.nameEn }}</span>
                <div class="profile-product__details">
                  <div class="profile-product__row">
                    <span>品类</span>
                    <span>{{ displayOrDash(item.category) }}</span>
                  </div>
                  <div class="profile-product__row">
                    <span>材料</span>
                    <span>{{ displayOrDash(item.materials) }}</span>
                  </div>
                  <div class="profile-product__row">
                    <span>应用场景</span>
                    <span>{{ displayOrDash(item.useCases) }}</span>
                  </div>
                  <div class="profile-product__row">
                    <span>差异化</span>
                    <span>{{ displayOrDash(item.differentiators) }}</span>
                  </div>
                  <div v-if="item.specs" class="profile-product__row">
                    <span>规格</span>
                    <span>{{ item.specs }}</span>
                  </div>
                </div>
              </template>
              <template v-else>
                <span class="profile-product__seq mono">{{ item.seq }}</span>
                <span class="profile-product__compact">
                  <span class="profile-product__name">{{ item.name }}</span>
                  <span class="profile-product__meta">{{ item.compactMeta }}</span>
                </span>
              </template>
            </button>
          </div>
        </section>

        <section class="profile-section">
          <h2 class="profile-section__title">市场与买家</h2>
          <div class="profile-market-grid">
            <div class="profile-field">
              <span class="profile-field__label">目标市场</span>
              <div class="profile-field__value">{{ marketRegions }}</div>
            </div>
            <div class="profile-field">
              <span class="profile-field__label">买家角色</span>
              <div class="profile-field__value">{{ buyerRoles }}</div>
            </div>
            <div class="profile-field">
              <span class="profile-field__label">公司类型</span>
              <div class="profile-field__value">{{ buyerCompanyTypes }}</div>
            </div>
          </div>
        </section>

        <div v-if="currentProfile.missingFields?.length" class="profile-missing">
          <div class="field-label">缺失字段</div>
          <ul>
            <li v-for="f in currentProfile.missingFields" :key="f">{{ f }}</li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
