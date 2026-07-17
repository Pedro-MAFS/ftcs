<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import Icon from '../components/shared/Icon.vue'
import type { ProfileDetail, ProfileSaveInput } from '../types/electron'

const meta = SECTION_META.profile
const {
  currentProfile,
  activeProductId,
  generating,
  agentStatus,
  loadActiveProfile,
  refreshProducts,
  applyProfileToState,
} = useWorkspace()

interface ProductDraft {
  name: string
  nameEn: string
  category: string
  materialsText: string
  useCasesText: string
  differentiatorsText: string
  specsText: string
}

interface ProfileDraft {
  companyName: string
  website: string
  country: string
  description: string
  certificationsText: string
  products: ProductDraft[]
  marketRegionsText: string
  buyerRolesText: string
  companyTypesText: string
}

const expandedIndex = ref(0)
const draft = ref<ProfileDraft | null>(null)
const baseline = ref('')
const saving = ref(false)
const saveMessage = ref('')
const saveError = ref(false)

const ROLE_LABELS: Record<string, string> = {
  procurement_manager: '采购经理',
  project_contractor: '工程承包商',
  distributor: '分销商',
  importer: '进口商',
  oem: 'OEM',
}

const ROLE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([k, v]) => [v, k]),
)

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

const COMPANY_TYPE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(COMPANY_TYPE_LABELS).map(([k, v]) => [v, k]),
)

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function joinList(value: unknown, sep = ' · '): string {
  if (!Array.isArray(value) || value.length === 0) return ''
  return value.map(String).filter(Boolean).join(sep)
}

function splitList(text: string): string[] {
  return text
    .split(/[,，、·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function emptyProduct(): ProductDraft {
  return {
    name: '',
    nameEn: '',
    category: '',
    materialsText: '',
    useCasesText: '',
    differentiatorsText: '',
    specsText: '',
  }
}

function buildDraft(profile: ProfileDetail): ProfileDraft {
  const company = asRecord(profile.raw.company)
  const productsRaw = Array.isArray(profile.raw.products) ? profile.raw.products : []
  const products = productsRaw.map((item) => {
    const row = asRecord(item) ?? {}
    return {
      name: String(row.name || ''),
      nameEn: String(row.name_en || ''),
      category: String(row.category || ''),
      materialsText: joinList(row.materials),
      useCasesText: joinList(row.use_cases),
      differentiatorsText: joinList(row.differentiators),
      specsText: joinList(row.specs),
    }
  })

  const markets = asRecord(profile.raw.target_markets)
  const buyers = Array.isArray(profile.raw.buyer_personas)
    ? profile.raw.buyer_personas.map(asRecord).filter(Boolean)
    : []

  const roles = buyers
    .map((b) => {
      const role = String(b?.role || '')
      return ROLE_LABELS[role] || role
    })
    .filter(Boolean)

  const types = new Set<string>()
  for (const b of buyers) {
    const list = b?.company_types
    if (!Array.isArray(list)) continue
    for (const t of list) {
      const key = String(t)
      types.add(COMPANY_TYPE_LABELS[key] || key)
    }
  }

  return {
    companyName: String(company?.name || ''),
    website: String(company?.website || ''),
    country: String(company?.country || ''),
    description: String(company?.description || ''),
    certificationsText: joinList(company?.certifications),
    products: products.length > 0 ? products : [emptyProduct()],
    marketRegionsText: joinList(markets?.regions),
    buyerRolesText: roles.join(' · '),
    companyTypesText: [...types].join(' · '),
  }
}

function snapshotDraft(value: ProfileDraft): string {
  return JSON.stringify(value)
}

function syncDraftFromProfile(profile: ProfileDetail | null): void {
  if (!profile) {
    draft.value = null
    baseline.value = ''
    return
  }
  const next = buildDraft(profile)
  draft.value = next
  baseline.value = snapshotDraft(next)
  expandedIndex.value = 0
  saveMessage.value = ''
  saveError.value = false
}

const dirty = computed(() => {
  if (!draft.value || !baseline.value) return false
  return snapshotDraft(draft.value) !== baseline.value
})

const readinessLabel = computed(() => {
  if (generating.value) return '生成中…'
  const p = currentProfile.value
  if (!p) return '—'
  return p.readinessScore != null ? `${p.readinessScore}%` : '—'
})

const statusLabel = computed(() => currentProfile.value?.status ?? '未生成')

watch(
  () => currentProfile.value,
  (profile) => {
    if (dirty.value) return
    syncDraftFromProfile(profile)
  },
  { immediate: true },
)

watch(activeProductId, () => {
  void loadActiveProfile().then(() => {
    syncDraftFromProfile(currentProfile.value)
  })
})

function toggleProduct(index: number): void {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

function addProduct(): void {
  if (!draft.value) return
  draft.value.products.push(emptyProduct())
  expandedIndex.value = draft.value.products.length - 1
}

function removeProduct(index: number): void {
  if (!draft.value || draft.value.products.length <= 1) return
  draft.value.products.splice(index, 1)
  if (expandedIndex.value >= draft.value.products.length) {
    expandedIndex.value = draft.value.products.length - 1
  }
}

function toSaveInput(productId: string, value: ProfileDraft): ProfileSaveInput {
  const roles = splitList(value.buyerRolesText).map(
    (label) => ROLE_REVERSE[label] || label,
  )
  const companyTypes = splitList(value.companyTypesText).map(
    (label) => COMPANY_TYPE_REVERSE[label] || label,
  )

  let buyer_personas: ProfileSaveInput['buyer_personas'] = []
  if (roles.length > 0) {
    buyer_personas = roles.map((role) => ({
      role,
      company_types: companyTypes,
    }))
  } else if (companyTypes.length > 0) {
    buyer_personas = [{ role: '', company_types: companyTypes }]
  }

  return {
    productId,
    company: {
      name: value.companyName,
      website: value.website,
      country: value.country,
      description: value.description,
      certifications: splitList(value.certificationsText),
    },
    products: value.products.map((p) => ({
      name: p.name,
      name_en: p.nameEn,
      category: p.category,
      materials: splitList(p.materialsText),
      use_cases: splitList(p.useCasesText),
      differentiators: splitList(p.differentiatorsText),
      specs: splitList(p.specsText),
    })),
    buyer_personas,
    target_markets: {
      regions: splitList(value.marketRegionsText),
    },
  }
}

async function reload(): Promise<void> {
  await refreshProducts()
  await loadActiveProfile()
  syncDraftFromProfile(currentProfile.value)
}

async function save(): Promise<void> {
  if (!draft.value || !activeProductId.value || !window.ftcs?.saveProfile) return
  saving.value = true
  saveMessage.value = ''
  saveError.value = false
  try {
    const res = await window.ftcs.saveProfile(
      toSaveInput(activeProductId.value, draft.value),
    )
    saveMessage.value = res.message
    saveError.value = !res.ok
    if (res.ok && res.profile) {
      applyProfileToState(res.profile)
      syncDraftFromProfile(res.profile)
    }
  } catch (err) {
    saveError.value = true
    saveMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
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
        <button
          type="button"
          class="btn-secondary"
          :disabled="generating || saving"
          @click="reload"
        >
          {{ dirty ? '放弃修改' : '刷新' }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="generating || saving || !dirty || !draft"
          @click="save"
        >
          <Icon name="save" :size="12" />
          {{ saving ? '保存中…' : '保存画像' }}
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
        <span v-if="dirty" class="ready-banner__dirty">未保存</span>
        <span v-if="activeProductId" class="mono muted">{{ activeProductId }}</span>
      </div>

      <p v-if="saveMessage" class="library-feedback" :class="saveError ? 'err' : 'ok'">
        {{ saveMessage }}
      </p>
      <p v-if="generating" class="library-feedback ok">
        Agent 正在执行 extract-product-profile，请查看右侧日志。完成后将自动刷新本页。
      </p>
      <p v-else-if="agentStatus === 'error'" class="library-feedback err">
        生成失败，请查看右侧 Agent 日志后重试。
      </p>
      <p v-else-if="!currentProfile" class="library-feedback muted">
        尚未生成画像。请到「录入」勾选网站/文件后点击「生成画像」。
      </p>

      <template v-if="draft">
        <section class="profile-section">
          <h2 class="profile-section__title">公司信息</h2>
          <div class="profile-company-grid">
            <label class="profile-field profile-field--grow">
              <span class="profile-field__label">公司名称</span>
              <input v-model="draft.companyName" class="profile-input" type="text" />
            </label>
            <label class="profile-field profile-field--grow">
              <span class="profile-field__label">官网</span>
              <input v-model="draft.website" class="profile-input profile-input--link" type="text" />
            </label>
            <label class="profile-field profile-field--country">
              <span class="profile-field__label">国家</span>
              <input v-model="draft.country" class="profile-input" type="text" />
            </label>
          </div>
          <label class="profile-field">
            <span class="profile-field__label">公司简介</span>
            <textarea
              v-model="draft.description"
              class="profile-input profile-input--area"
              rows="3"
            />
          </label>
          <label class="profile-field">
            <span class="profile-field__label">认证资质（逗号或顿号分隔）</span>
            <input v-model="draft.certificationsText" class="profile-input" type="text" />
          </label>
        </section>

        <section class="profile-section">
          <div class="profile-section__head">
            <h2 class="profile-section__title">产品列表</h2>
            <div class="profile-section__actions">
              <span class="profile-section__meta">共 {{ draft.products.length }} 个</span>
              <button type="button" class="btn-secondary btn-secondary--sm" @click="addProduct">
                添加产品
              </button>
            </div>
          </div>

          <div class="profile-products">
            <div
              v-for="(item, index) in draft.products"
              :key="index"
              class="profile-product"
              :class="{ 'is-expanded': expandedIndex === index }"
            >
              <button
                type="button"
                class="profile-product__toggle"
                @click="toggleProduct(index)"
              >
                <span class="profile-product__seq mono">{{
                  String(index + 1).padStart(2, '0')
                }}</span>
                <span class="profile-product__compact">
                  <span class="profile-product__name">{{ item.name || '未命名产品' }}</span>
                  <span class="profile-product__meta">{{
                    [item.nameEn, item.useCasesText].filter(Boolean).join('  ·  ') ||
                    item.category ||
                    '点击展开编辑'
                  }}</span>
                </span>
                <span class="profile-product__chevron">{{
                  expandedIndex === index ? '收起' : '编辑'
                }}</span>
              </button>

              <div v-if="expandedIndex === index" class="profile-product__editor">
                <div class="profile-product__grid">
                  <label class="profile-field">
                    <span class="profile-field__label">产品名称</span>
                    <input v-model="item.name" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field">
                    <span class="profile-field__label">英文名</span>
                    <input v-model="item.nameEn" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field">
                    <span class="profile-field__label">品类</span>
                    <input v-model="item.category" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field">
                    <span class="profile-field__label">材料</span>
                    <input v-model="item.materialsText" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field profile-field--span">
                    <span class="profile-field__label">应用场景</span>
                    <input v-model="item.useCasesText" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field profile-field--span">
                    <span class="profile-field__label">差异化卖点</span>
                    <input v-model="item.differentiatorsText" class="profile-input" type="text" />
                  </label>
                  <label class="profile-field profile-field--span">
                    <span class="profile-field__label">规格</span>
                    <input v-model="item.specsText" class="profile-input" type="text" />
                  </label>
                </div>
                <div class="profile-product__footer">
                  <button
                    type="button"
                    class="btn-secondary btn-secondary--sm btn-danger-text"
                    :disabled="draft.products.length <= 1"
                    @click="removeProduct(index)"
                  >
                    删除此产品
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="profile-section">
          <h2 class="profile-section__title">市场与买家</h2>
          <div class="profile-market-grid">
            <label class="profile-field">
              <span class="profile-field__label">目标市场</span>
              <input
                v-model="draft.marketRegionsText"
                class="profile-input"
                type="text"
                placeholder="如 EU · NA · AU"
              />
            </label>
            <label class="profile-field">
              <span class="profile-field__label">买家角色</span>
              <input
                v-model="draft.buyerRolesText"
                class="profile-input"
                type="text"
                placeholder="如 采购经理 · 工程承包商"
              />
            </label>
            <label class="profile-field">
              <span class="profile-field__label">公司类型</span>
              <input
                v-model="draft.companyTypesText"
                class="profile-input"
                type="text"
                placeholder="如 分销商 · 进口商"
              />
            </label>
          </div>
        </section>

        <div v-if="currentProfile?.missingFields?.length" class="profile-missing">
          <div class="field-label">缺失字段（保存后自动重算）</div>
          <ul>
            <li v-for="f in currentProfile.missingFields" :key="f">{{ f }}</li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
