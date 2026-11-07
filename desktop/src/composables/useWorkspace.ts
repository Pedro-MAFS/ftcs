import { computed, ref, watch } from 'vue'
import type {
  AgentMetaItem,
  AgentTimelineItem,
  PipelineStep,
  ProductSummary,
  WorkspaceSection,
} from '../types/workspace'
import type {
  AgentEventPayload,
  AwaitingUserReply,
  PermissionAskView,
  EmailDraftsSnapshotDto,
  ExploreTasksSnapshotDto,
  KeywordExpansionDto,
  LeadsSnapshotDto,
  ProfileDetail,
} from '../types/electron'
import { derivePipelineSteps, pendingPipelineSteps } from './pipeline-steps'

const products = ref<ProductSummary[]>([])
const activeProductId = ref('')
const currentProfile = ref<ProfileDetail | null>(null)
const currentExpansion = ref<KeywordExpansionDto | null>(null)
const exploreTasks = ref<ExploreTasksSnapshotDto | null>(null)
const leadsSnapshot = ref<LeadsSnapshotDto | null>(null)
const emailDraftsSnapshot = ref<EmailDraftsSnapshotDto | null>(null)

export const pipelineSteps = ref<PipelineStep[]>(pendingPipelineSteps())

type Task = Extract<AgentEventPayload, { type: 'task.changed' }>['task']
const latestTask = ref<Task | null>(null)
const taskFinished = ref<Task | null>(null)
let selectionVersion = 0
let profileStartSelection: number | undefined
let artifactsVersion = 0
let profileVersion = 0
let productsVersion = 0
let sessionVersion = 0
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
const awaitingUserReply = ref<AwaitingUserReply>(null)
const pendingPermission = ref<PermissionAskView>(null)
/** 自由回复这一轮。不写入 agentStatus，流水线不会把它当成任务在跑。 */
const dialogueBusy = ref(false)
const generating = computed(() => agentStatus.value === 'running')

const runningForProduct = computed(() => generating.value && latestTask.value?.scope.product_id === activeProductId.value)

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
let productNoteBound = false
let pipelineReady: Promise<void> | null = null

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

async function refreshPipelineArtifacts(): Promise<void> {
  const version = ++artifactsVersion
  const pid = activeProductId.value
  if (!pid || !window.ftcs) {
    exploreTasks.value = null
    currentExpansion.value = null
    leadsSnapshot.value = null
    emailDraftsSnapshot.value = null
    updatePipelineFromProfile()
    return
  }
  const [explore, leads, emails] = await Promise.all([
    window.ftcs.listExploreTasks?.(pid) ?? Promise.resolve(null),
    window.ftcs.listLeads?.(pid) ?? Promise.resolve(null),
    window.ftcs.listEmailDrafts?.(pid) ?? Promise.resolve(null),
  ])
  if (pid !== activeProductId.value || version !== artifactsVersion) return
  exploreTasks.value = explore
  currentExpansion.value = explore?.expansion ?? null
  leadsSnapshot.value = leads
  emailDraftsSnapshot.value = emails
  updatePipelineFromProfile()
}

async function refreshExploreTasks(): Promise<void> {
  await refreshPipelineArtifacts()
}

async function refreshProducts(loadSelected = true): Promise<void> {
  if (!window.ftcs?.listProfiles) return
  const version = ++productsVersion
  const list = await window.ftcs.listProfiles()
  if (version !== productsVersion) return
  products.value = list.map(toProductSummary)
  if (!activeProductId.value && products.value[0]) {
    activeProductId.value = products.value[0].id
  }
  if (loadSelected && activeProductId.value) {
    await loadActiveProfile()
    await refreshPipelineArtifacts()
  }
  updatePipelineFromProfile()
}

async function loadActiveProfile(): Promise<void> {
  if (!window.ftcs?.getProfile || !activeProductId.value) {
    currentProfile.value = null
    return
  }
  const pid = activeProductId.value
  const version = ++profileVersion
  const profile = await window.ftcs.getProfile(pid)
  if (pid !== activeProductId.value || version !== profileVersion) return
  currentProfile.value = profile
  updatePipelineFromProfile()
}

function updatePipelineFromProfile(): void {
  const profile = currentProfile.value
  if (!profile) {
    pipelineSteps.value = pendingPipelineSteps()
    return
  }

  const runningHere = runningForProduct.value
  const generatingProfile =
    runningHere && agentSkill.value === 'extract-product-profile'
  const expandingKeywords =
    runningHere && agentSkill.value === 'expand-keywords'
  const exploring =
    runningHere &&
    (agentSkill.value === 'discover-leads' ||
      agentSkill.value === 'discover-leads-r2' ||
      agentSkill.value === 'discover-leads-r3')
  const scoring =
    runningHere && ['score-and-dedupe', 'enrich-lead-contacts'].includes(agentSkill.value)
  const drafting =
    runningHere && ['draft-outreach-email', 'translate-outreach-email'].includes(agentSkill.value)

  pipelineSteps.value = derivePipelineSteps({
    profileReady: profile.status === 'ready',
    hasKeywords: !!currentExpansion.value,
    hasExploreCompleted: (exploreTasks.value?.summary.completed ?? 0) > 0,
    hasExploreRunning: exploring,
    scoredCount: leadsSnapshot.value?.stats.scored ?? 0,
    emailDraftCount: emailDraftsSnapshot.value?.stats.total ?? 0,
    generatingProfile,
    expandingKeywords,
    exploring,
    scoring,
    drafting,
  })
}

const taskLabels = {
  preparing: '准备中', running: '执行中', succeeded: '已完成', partial: '部分完成',
  failed: '失败', cancelled: '已取消', interrupted: '已中断',
}

function applyTask(task: Task, fromSnapshot = false): void {
  const prev = latestTask.value
  if (prev?.task_id === task.task_id && prev.revision >= task.revision) return
  if (fromSnapshot && prev && prev.task_id !== task.task_id) return
  if (!fromSnapshot && task.task_type === 'extract-product-profile' && task.state === 'preparing' && prev?.task_id !== task.task_id) {
    profileStartSelection = task.scope.product_id ? undefined : selectionVersion
  }
  latestTask.value = task
  agentSkill.value = task.task_type
  agentStatus.value = !task.finished_at ? 'running' : task.state === 'succeeded' ? 'done' : 'error'
  agentMeta.value = [
    { label: '状态', value: taskLabels[task.state], tone: !task.finished_at ? 'accent' : task.state === 'succeeded' ? 'success' : 'warning' },
    { label: '说明', value: task.message },
  ]
  if (task.result?.completed_count != null) agentMeta.value.push({ label: '完成数', value: String(task.result.completed_count) })
  updatePipelineFromProfile()
  if (!task.finished_at || fromSnapshot) return
  const pid = task.scope.product_id
  if (task.task_type === 'extract-product-profile') {
    if (pid && task.state === 'succeeded' && profileStartSelection === selectionVersion) activeProductId.value = pid
    profileStartSelection = undefined
    void refreshProducts(pid === activeProductId.value).then(() => { taskFinished.value = task })
  } else if (pid === activeProductId.value) {
    void refreshPipelineArtifacts().then(() => { taskFinished.value = task })
  }
}

function handleAgentEvent(payload: AgentEventPayload): void {
  if (payload.type === 'session.created') {
    sessionVersion++
    latestTask.value = null
    agentSkill.value = 'idle'
    agentStatus.value = 'idle'
    agentMeta.value = []
    agentTimeline.value = []
    agentExpanded.value = {}
    agentPrompt.value = ''
    awaitingUserReply.value = null
    pendingPermission.value = null
    updatePipelineFromProfile()
    return
  }
  if (payload.type === 'task.changed') {
    applyTask(payload.task)
    return
  }
  if (payload.type === 'timeline') {
    agentTimeline.value = payload.items
    return
  }
  if (payload.type === 'awaiting-reply') {
    awaitingUserReply.value = payload.pending
    return
  }
  if (payload.type === 'permission-ask') {
    pendingPermission.value = payload.pending
    return
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
    const version = sessionVersion
    void Promise.all([
      window.ftcs.taskSnapshot?.() ?? Promise.resolve([]),
      window.ftcs.currentAgentSession?.() ?? Promise.resolve(null),
    ]).then(([history, sessionId]) => {
      if (version !== sessionVersion) return
      const matching = sessionId ? history.filter(task => task.session_id === sessionId) : history
      const last = matching[matching.length - 1]
      if (last) applyTask(last, true)
    }).catch(() => undefined)
  }
  if (!productNoteBound && typeof window !== 'undefined') {
    productNoteBound = true
    watch(activeProductId, (id) => {
      selectionVersion++
      const note = window.ftcs?.noteActiveProduct
      if (!note) return
      void note(id)
    }, { flush: 'sync' })
  }
  if (!productsLoaded) {
    productsLoaded = true
    pipelineReady = refreshProducts().then(
      () => undefined,
      () => undefined,
    )
  }
}

export function whenPipelineReady(): Promise<void> {
  ensureWorkspaceBindings()
  return pipelineReady ?? Promise.resolve()
}

export function useWorkspace() {
  ensureWorkspaceBindings()

  function selectProduct(id: string): void {
    activeProductId.value = id
    void loadActiveProfile().then(() => refreshPipelineArtifacts())
  }

  async function deleteProduct(id: string): Promise<{ ok: boolean; message: string }> {
    if (!window.ftcs?.deleteProfile) {
      return { ok: false, message: '操作失败，请重试' }
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
        await refreshPipelineArtifacts()
      } else {
        currentProfile.value = null
        currentExpansion.value = null
        exploreTasks.value = null
        leadsSnapshot.value = null
        emailDraftsSnapshot.value = null
        updatePipelineFromProfile()
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
      return { ok: false, message: '操作失败，请重试' }
    }
    const res = await window.ftcs.createDraftProfile()
    if (!res.ok || !res.profile) {
      return { ok: false, message: res.message }
    }
    applyProfileToState(res.profile)
    activeProductId.value = res.profile.id
    currentExpansion.value = null
    exploreTasks.value = null
    leadsSnapshot.value = null
    emailDraftsSnapshot.value = null
    updatePipelineFromProfile()
    return { ok: true, message: res.message, productId: res.profile.id }
  }

  function setAgentContext(section: WorkspaceSection): void {
    if (!latestTask.value) {
      agentSkill.value = SECTION_SKILL[section] ?? 'idle'
    }
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
    leadsSnapshot,
    emailDraftsSnapshot,
    pipelineSteps,
    runningForProduct,
    latestTask,
    taskFinished,
    agentSkill,
    agentStatus,
    agentMeta,
    agentTimeline,
    agentPrompt,
    awaitingUserReply,
    pendingPermission,
    dialogueBusy,
    generating,
    selectProduct,
    deleteProduct,
    createDraftProduct,
    setAgentContext,
    toggleTimelineExpand,
    isTimelineExpanded,
    refreshProducts,
    loadActiveProfile,
    refreshExploreTasks,
    refreshPipelineArtifacts,
    applyProfileToState,
  }
}
