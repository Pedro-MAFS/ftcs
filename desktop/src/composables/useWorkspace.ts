import { computed, ref } from 'vue'
import type {
  AgentMetaItem,
  AgentTimelineItem,
  PipelineStep,
  ProductSummary,
  WorkspaceSection,
} from '../types/workspace'
import type { AgentEventPayload, ProfileDetail } from '../types/electron'

const products = ref<ProductSummary[]>([])
const activeProductId = ref('')
const currentProfile = ref<ProfileDetail | null>(null)

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

function toProductSummary(profile: {
  id: string
  status: string
  readinessScore?: number
  companyName?: string
  productName?: string
}): ProductSummary {
  const name = profile.productName || profile.companyName || profile.id
  const score =
    profile.readinessScore != null ? `就绪度 ${profile.readinessScore}` : profile.status
  return {
    id: profile.id,
    name,
    meta: `${profile.status} · ${score}`,
  }
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
  pipelineSteps.value = [
    { id: 'input', label: '1 产品录入', status: 'done', statusLabel: '完成' },
    {
      id: 'keywords',
      label: '2 关键词扩展',
      status: 'pending',
      statusLabel: ready ? '可执行' : '待就绪',
    },
    { id: 'explore', label: '3 R1 探索', status: 'pending', statusLabel: '待执行' },
    { id: 'score', label: '4 线索评分', status: 'pending', statusLabel: '待执行' },
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
    return
  }
  if (payload.type === 'timeline') {
    agentTimeline.value = payload.items
    return
  }
  if (payload.type === 'done') {
    agentStatus.value = payload.ok ? 'done' : 'error'
    if (payload.profile) {
      currentProfile.value = payload.profile
      const summary = toProductSummary(payload.profile)
      const idx = products.value.findIndex((p) => p.id === summary.id)
      if (idx >= 0) products.value[idx] = summary
      else products.value = [summary, ...products.value]
      activeProductId.value = summary.id
      updatePipelineFromProfile()
    } else {
      void refreshProducts()
    }
  }
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
    void loadActiveProfile()
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
    pipelineSteps,
    agentSkill,
    agentStatus,
    agentMeta,
    agentTimeline,
    agentPrompt,
    generating,
    selectProduct,
    setAgentContext,
    resetAgentForGenerate,
    toggleTimelineExpand,
    isTimelineExpanded,
    refreshProducts,
    loadActiveProfile,
  }
}
