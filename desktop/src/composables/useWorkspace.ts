import { computed, ref } from 'vue'
import type {
  AgentMetaItem,
  AgentTimelineItem,
  PipelineStep,
  ProductSummary,
  WorkspaceSection,
} from '../types/workspace'
import type {
  AgentEventPayload,
  ExploreTasksSnapshotDto,
  KeywordExpansionDto,
  ProfileDetail,
} from '../types/electron'

const products = ref<ProductSummary[]>([])
const activeProductId = ref('')
const currentProfile = ref<ProfileDetail | null>(null)
const currentExpansion = ref<KeywordExpansionDto | null>(null)
const exploreTasks = ref<ExploreTasksSnapshotDto | null>(null)

const pipelineSteps = ref<PipelineStep[]>([
  { id: 'input', label: '1 产品录入', status: 'pending', statusLabel: '待执行' },
  { id: 'keywords', label: '2 关键词扩展', status: 'pending', statusLabel: '待执行' },
  { id: 'explore', label: '3 R1 探索', status: 'pending', statusLabel: '待执行' },
  { id: 'score', label: '4 线索评分', status: 'pending', statusLabel: '待执行' },
  { id: 'email', label: '5 邮件草稿', status: 'pending', statusLabel: '待执行' },
])

const agentSkill = ref('extract-product-profile')
const agentStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle')
const agentMeta = ref<AgentMetaItem[]>([
  { label: '就绪度', value: '待生成' },
  { label: '选中', value: '0 项' },
  { label: '来源', value: '资料库' },
])
const agentTimeline = ref<AgentTimelineItem[]>([])
const agentExpanded = ref<Record<string, boolean>>({})
const agentPrompt = ref('')
const generating = computed(() => agentStatus.value === 'running')

const activeProduct = computed(
  () => products.value.find((p) => p.id === activeProductId.value) ?? products.value[0],
)

const SECTION_SKILL: Partial<Record<WorkspaceSection, string>> = {
  input: 'extract-product-profile',
  profile: 'expand-keywords',
  explore: 'discover-leads',
  leads: 'score-and-dedupe',
  email: 'draft-outreach-email',
  settings: 'idle',
}

let agentBound = false
let productsLoaded = false

const PRODUCT_PREVIEW_COUNT = 3

function formatProductsLabel(names: string[]): { label: string; tooltip: string } {
  const tooltip = names.length > 0 ? names.join('\n') : '暂无产品'
  if (names.length === 0) return { label: '暂无产品', tooltip }
  if (names.length <= PRODUCT_PREVIEW_COUNT) {
    return { label: names.join(' · '), tooltip }
  }
  const visible = names.slice(0, PRODUCT_PREVIEW_COUNT)
  const rest = names.length - PRODUCT_PREVIEW_COUNT
  return { label: `${visible.join(' · ')} · +${rest}`, tooltip }
}

function statusPresentation(status: string): {
  label: string
  tone: ProductSummary['statusTone']
} {
  const key = status.trim().toLowerCase()
  if (key === 'ready') return { label: '就绪', tone: 'success' }
  if (key === 'draft') return { label: '草稿', tone: 'warning' }
  if (key === 'exploring' || key === 'running') return { label: '探索中', tone: 'accent' }
  if (!key) return { label: '未知', tone: 'muted' }
  return { label: status, tone: 'muted' }
}

function formatUpdatedLabel(updatedAt?: string): string {
  if (!updatedAt) return '—'
  const t = Date.parse(updatedAt)
  if (!Number.isFinite(t)) return '—'
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd} 更新`
}

function toProductSummary(profile: {
  id: string
  status: string
  readinessScore?: number
  companyName?: string
  productName?: string
  productNames?: string[]
  updatedAt?: string
}): ProductSummary {
  const companyName = profile.companyName?.trim() || '未命名草稿'
  const names =
    profile.productNames && profile.productNames.length > 0
      ? profile.productNames
      : profile.productName
        ? [profile.productName]
        : []
  const { label: productsLabel, tooltip: productsTooltip } = formatProductsLabel(names)
  const status = statusPresentation(profile.status)
  return {
    id: profile.id,
    name: companyName,
    companyName,
    productsLabel,
    productsTooltip,
    status: profile.status,
    statusLabel: status.label,
    statusTone: status.tone,
    updatedLabel: formatUpdatedLabel(profile.updatedAt),
  }
}

async function refreshExploreTasks(): Promise<void> {
  if (!window.ftcs?.listExploreTasks || !activeProductId.value) {
    exploreTasks.value = null
    currentExpansion.value = null
    return
  }
  const snap = await window.ftcs.listExploreTasks(activeProductId.value)
  exploreTasks.value = snap
  currentExpansion.value = snap.expansion
  updatePipelineFromProfile()
}

async function refreshProducts(): Promise<void> {
  if (!window.ftcs?.listProfiles) return
  const list = await window.ftcs.listProfiles()
  products.value = list.map(toProductSummary)
  if (!activeProductId.value && products.value[0]) {
    activeProductId.value = products.value[0].id
  }
  if (activeProductId.value) {
    await loadActiveProfile()
    await refreshExploreTasks()
  }
  updatePipelineFromProfile()
}

async function loadActiveProfile(): Promise<void> {
  if (!window.ftcs?.getProfile || !activeProductId.value) {
    currentProfile.value = null
    return
  }
  currentProfile.value = await window.ftcs.getProfile(activeProductId.value)
  updatePipelineFromProfile()
}

function updatePipelineFromProfile(): void {
  const profile = currentProfile.value
  if (!profile) return
  const ready = profile.status === 'ready'
  const hasKeywords = !!currentExpansion.value
  const hasRunning = (exploreTasks.value?.summary.running ?? 0) > 0
  const hasCompleted = (exploreTasks.value?.summary.completed ?? 0) > 0
  const expanding =
    agentStatus.value === 'running' && agentSkill.value === 'expand-keywords'
  const exploring =
    agentStatus.value === 'running' && agentSkill.value === 'discover-leads'
  const scoring =
    agentStatus.value === 'running' && agentSkill.value === 'score-and-dedupe'
  const hasScored =
    agentSkill.value === 'score-and-dedupe' && agentStatus.value === 'done'

  pipelineSteps.value = [
    { id: 'input', label: '1 产品录入', status: 'done', statusLabel: '完成' },
    {
      id: 'keywords',
      label: '2 关键词扩展',
      status: hasKeywords ? 'done' : expanding ? 'running' : 'pending',
      statusLabel: hasKeywords
        ? '完成'
        : expanding
          ? '执行中'
          : ready
            ? '可执行'
            : '待就绪',
    },
    {
      id: 'explore',
      label: '3 R1 探索',
      status: hasCompleted
        ? 'done'
        : hasRunning || exploring
          ? 'running'
          : 'pending',
      statusLabel: hasCompleted
        ? '完成'
        : hasRunning || exploring
          ? '执行中'
          : hasKeywords
            ? '可执行'
            : '待关键词',
    },
    {
      id: 'score',
      label: '4 线索评分',
      status: hasScored ? 'done' : scoring ? 'running' : 'pending',
      statusLabel: hasScored
        ? '完成'
        : scoring
          ? '执行中'
          : hasCompleted
            ? '可执行'
            : '待探索',
    },
    { id: 'email', label: '5 邮件草稿', status: 'pending', statusLabel: '待执行' },
  ]
}

function handleAgentEvent(payload: AgentEventPayload): void {
  if (payload.type === 'state') {
    agentSkill.value = payload.skill
    agentStatus.value = payload.status
    agentMeta.value = payload.meta.map((m) => ({
      label: m.label,
      value: m.value,
      tone: (m.tone as AgentMetaItem['tone']) || undefined,
    }))
    if (payload.productId) {
      activeProductId.value = payload.productId
    }
    updatePipelineFromProfile()
    return
  }
  if (payload.type === 'timeline') {
    agentTimeline.value = payload.items
    return
  }
  if (payload.type === 'done') {
    agentStatus.value = payload.ok ? 'done' : 'error'
    if (payload.profile) {
      applyProfileToState(payload.profile)
      activeProductId.value = payload.profile.id
    }
    if (payload.expansion) {
      currentExpansion.value = payload.expansion
    }
    void refreshProducts()
    void refreshExploreTasks()
  }
}

function applyProfileToState(profile: ProfileDetail): void {
  currentProfile.value = profile
  const summary = toProductSummary(profile)
  const idx = products.value.findIndex((p) => p.id === summary.id)
  if (idx >= 0) products.value[idx] = summary
  else products.value = [summary, ...products.value]
  updatePipelineFromProfile()
}

function ensureWorkspaceBindings(): void {
  if (!agentBound && window.ftcs?.onAgentEvent) {
    window.ftcs.onAgentEvent(handleAgentEvent)
    agentBound = true
  }
  if (!productsLoaded) {
    productsLoaded = true
    void refreshProducts()
  }
}

export function useWorkspace() {
  ensureWorkspaceBindings()

  function selectProduct(id: string): void {
    activeProductId.value = id
    void loadActiveProfile().then(() => refreshExploreTasks())
  }

  async function deleteProduct(id: string): Promise<{ ok: boolean; message: string }> {
    if (!window.ftcs?.deleteProfile) {
      return { ok: false, message: '删除接口不可用' }
    }
    const res = await window.ftcs.deleteProfile(id)
    if (!res.ok) return { ok: false, message: res.message }

    const wasActive = activeProductId.value === id
    products.value = products.value.filter((p) => p.id !== id)

    if (wasActive) {
      const next = products.value[0]
      activeProductId.value = next?.id ?? ''
      if (next) {
        await loadActiveProfile()
        await refreshExploreTasks()
      } else {
        currentProfile.value = null
        currentExpansion.value = null
        exploreTasks.value = null
      }
    }

    return { ok: true, message: res.message }
  }

  async function createDraftProduct(): Promise<{
    ok: boolean
    message: string
    productId?: string
  }> {
    if (!window.ftcs?.createDraftProfile) {
      return { ok: false, message: '新建草稿接口不可用' }
    }
    const res = await window.ftcs.createDraftProfile()
    if (!res.ok || !res.profile) {
      return { ok: false, message: res.message }
    }
    applyProfileToState(res.profile)
    activeProductId.value = res.profile.id
    currentExpansion.value = null
    exploreTasks.value = null
    return { ok: true, message: res.message, productId: res.profile.id }
  }

  function setAgentContext(section: WorkspaceSection): void {
    if (agentStatus.value !== 'running') {
      agentSkill.value = SECTION_SKILL[section] ?? 'idle'
    }
  }

  function resetAgentForGenerate(selectedCount: number): void {
    agentSkill.value = 'extract-product-profile'
    agentStatus.value = 'running'
    agentTimeline.value = []
    agentExpanded.value = {}
    agentMeta.value = [
      { label: '就绪度', value: '生成中', tone: 'accent' },
      { label: '选中', value: `${selectedCount} 项` },
      { label: '来源', value: '资料库' },
    ]
  }

  function resetAgentForExpandKeywords(): void {
    agentSkill.value = 'expand-keywords'
    agentStatus.value = 'running'
    agentTimeline.value = []
    agentExpanded.value = {}
    agentMeta.value = [
      { label: '状态', value: '扩展中', tone: 'accent' },
      { label: '产品', value: activeProductId.value.slice(0, 18) || '—' },
      { label: '来源', value: '画像' },
    ]
  }

  function resetAgentForDiscoverLeads(maxQueries = 10): void {
    agentSkill.value = 'discover-leads'
    agentStatus.value = 'running'
    agentTimeline.value = []
    agentExpanded.value = {}
    agentMeta.value = [
      { label: '状态', value: '探索中', tone: 'accent' },
      { label: '进度', value: `0/${maxQueries}` },
      { label: '线索', value: '0' },
      { label: '来源', value: '关键词' },
    ]
  }

  function resetAgentForScoreAndDedupe(rawCount?: number): void {
    agentSkill.value = 'score-and-dedupe'
    agentStatus.value = 'running'
    agentTimeline.value = []
    agentExpanded.value = {}
    agentMeta.value = [
      { label: '状态', value: '评分中', tone: 'accent' },
      { label: '原始', value: rawCount != null ? String(rawCount) : '—' },
      { label: '产品', value: activeProductId.value.slice(0, 18) || '—' },
    ]
  }

  function toggleTimelineExpand(id: string): void {
    agentExpanded.value = {
      ...agentExpanded.value,
      [id]: !agentExpanded.value[id],
    }
  }

  function isTimelineExpanded(item: AgentTimelineItem): boolean {
    if (Object.prototype.hasOwnProperty.call(agentExpanded.value, item.id)) {
      return !!agentExpanded.value[item.id]
    }
    return !item.collapsed
  }

  return {
    products,
    activeProductId,
    activeProduct,
    currentProfile,
    currentExpansion,
    exploreTasks,
    pipelineSteps,
    agentSkill,
    agentStatus,
    agentMeta,
    agentTimeline,
    agentPrompt,
    generating,
    selectProduct,
    deleteProduct,
    createDraftProduct,
    setAgentContext,
    resetAgentForGenerate,
    resetAgentForExpandKeywords,
    resetAgentForDiscoverLeads,
    resetAgentForScoreAndDedupe,
    toggleTimelineExpand,
    isTimelineExpanded,
    refreshProducts,
    loadActiveProfile,
    refreshExploreTasks,
    applyProfileToState,
  }
}
