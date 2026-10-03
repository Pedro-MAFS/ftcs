<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import { showToast } from '../composables/useToast'
import Icon from '../components/shared/Icon.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import type {
  EmailDraftRowDto,
  EmailDraftSlotDetailDto,
  EmailDraftsSnapshotDto,
  EmailRecipientPoolItemDto,
} from '../types/electron'

const meta = SECTION_META.email
const route = useRoute()
const router = useRouter()
const {
  activeProductId,
  generating,
  agentSkill,
  agentStatus,
  resetAgentForDraftEmail,
  resetAgentForTranslateEmail,
} = useWorkspace()

const loading = ref(false)
const slotLoading = ref(false)
const drafting = ref(false)
const saving = ref(false)
const rejecting = ref(false)
const approving = ref(false)
const rejectConfirmOpen = ref(false)
const rejectAllConfirmOpen = ref(false)
const rewriteConfirmOpen = ref(false)
const discardConfirmOpen = ref(false)
const zhContrastOpen = ref(false)
const pendingRecipientKey = ref('')
const actionMessage = ref('')

watch(actionMessage, (msg) => {
  const text = msg.trim()
  if (!text) return
  showToast(text)
  actionMessage.value = ''
})

const snapshot = ref<EmailDraftsSnapshotDto | null>(null)
const selectedId = ref('')
const selectedRecipientKey = ref('company')
const recipientPool = ref<EmailRecipientPoolItemDto[]>([])
const slotDetail = ref<EmailDraftSlotDetailDto | null>(null)

const editLeadId = ref('')
const editRecipientKey = ref('')
const editSubject = ref('')
const editBody = ref('')
const savedSubject = ref('')
const savedBody = ref('')

const emptyStats = { total: 0, pendingReview: 0, pendingHigh: 0 }

const stats = computed(() => snapshot.value?.stats ?? emptyStats)
const drafts = computed(() => snapshot.value?.drafts ?? [])
const pendingHigh = computed(() => snapshot.value?.pendingHighLeadIds ?? [])

const selected = computed(() => {
  if (!selectedId.value) return drafts.value[0] ?? null
  return drafts.value.find((d) => d.leadId === selectedId.value) ?? null
})

const activePoolItem = computed(
  () =>
    recipientPool.value.find((p) => p.recipientKey === selectedRecipientKey.value) ??
    null,
)

const hasSlotDraft = computed(() => Boolean(slotDetail.value?.exists))

const isDirty = computed(
  () =>
    hasSlotDraft.value &&
    (editSubject.value !== savedSubject.value || editBody.value !== savedBody.value),
)

const isDrafting = computed(
  () =>
    drafting.value ||
    (generating.value &&
      (agentSkill.value === 'draft-outreach-email' ||
        agentSkill.value === 'translate-outreach-email')),
)

const isTranslatingZh = computed(
  () =>
    generating.value && agentSkill.value === 'translate-outreach-email',
)

const isBusy = computed(
  () =>
    isDrafting.value ||
    generating.value ||
    rejecting.value ||
    approving.value ||
    saving.value,
)

const canBatchDraft = computed(
  () =>
    !!activeProductId.value &&
    !isBusy.value &&
    pendingHigh.value.length > 0,
)

const canReject = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    hasSlotDraft.value &&
    !isBusy.value,
)

const canApprove = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    hasSlotDraft.value &&
    !isBusy.value,
)

const canViewLead = computed(() => !!selected.value?.leadId)

const canSave = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    hasSlotDraft.value &&
    isDirty.value &&
    !isBusy.value,
)

const canSlotDraft = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    !!selectedRecipientKey.value &&
    !isBusy.value,
)

const canGenerateZh = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    hasSlotDraft.value &&
    !isDirty.value &&
    !isBusy.value,
)

const hasZhContrast = computed(
  () => Boolean(slotDetail.value?.subjectZh || slotDetail.value?.bodyZh),
)

const zhContrastStale = computed(() => Boolean(slotDetail.value?.zhStale))

const zhActionLabel = computed(() => {
  if (isTranslatingZh.value) return '生成中…'
  return hasZhContrast.value ? '刷新中文对照' : '生成中文对照'
})

const slotActionLabel = computed(() => {
  if (isDrafting.value) return hasSlotDraft.value ? '重写中…' : '起草中…'
  return hasSlotDraft.value ? '重写' : '为该收件人起草'
})

const rejectConfirmMessage = computed(() => {
  const name =
    activePoolItem.value?.displayName?.trim() ||
    activePoolItem.value?.email?.trim() ||
    '当前收件人'
  return `将删除「${name}」的开发信，其它收件人草稿保留。`
})

const rejectAllConfirmMessage = computed(() => {
  const draft = selected.value
  if (!draft) return ''
  return `确定驳回「${draft.companyName}」整条线索的全部开发信吗？将删除 data/emails 下该线索目录，并把线索状态回退为 new。`
})

const emptyStateHint = computed(() => {
  if (activePoolItem.value?.kind === 'company') {
    return '将生成公司向开发信（Dear … Team）'
  }
  if (activePoolItem.value?.source === 'people') {
    return '将仅为该联系人生成一封，不会自动写入 contacts'
  }
  return '将仅为该收件人生成一封开发信'
})

const stylePromptPreview = computed(() => {
  const raw = slotDetail.value?.stylePrompt?.trim()
  if (!raw) return ''
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw
})

const subtitle = computed(() => {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  const s = stats.value
  if (s.total === 0) {
    return pendingHigh.value.length > 0
      ? `暂无草稿 · ${pendingHigh.value.length} 条已评分线索可批量起草`
      : '暂无草稿 · 请先在线索页完成评分，再批量起草开发信'
  }
  return `${s.total} 条线索有稿 · 待审 ${s.pendingReview} · 待起草 ${s.pendingHigh}`
})

function routeLeadId(): string {
  const q = route.query.leadId
  if (typeof q === 'string') return q.trim()
  if (Array.isArray(q) && typeof q[0] === 'string') return q[0].trim()
  return ''
}

function routeRecipientKey(): string {
  const q = route.query.recipientKey
  if (typeof q === 'string') return q.trim()
  if (Array.isArray(q) && typeof q[0] === 'string') return q[0].trim()
  return ''
}

function clearEdits(): void {
  editLeadId.value = ''
  editRecipientKey.value = ''
  editSubject.value = ''
  editBody.value = ''
  savedSubject.value = ''
  savedBody.value = ''
  slotDetail.value = null
}

function hydrateFromSlot(detail: EmailDraftSlotDetailDto, force: boolean): void {
  // 与旧版一致：同 lead+槽 且非强制时不覆盖编辑区，避免轮询把输入框「闪」掉
  if (
    !force &&
    editLeadId.value === detail.leadId &&
    editRecipientKey.value === detail.recipientKey
  ) {
    slotDetail.value = detail
    return
  }
  editLeadId.value = detail.leadId
  editRecipientKey.value = detail.recipientKey
  if (detail.exists) {
    editSubject.value = detail.subject || ''
    editBody.value = detail.body || ''
    savedSubject.value = detail.subject || ''
    savedBody.value = detail.body || ''
  } else {
    editSubject.value = ''
    editBody.value = ''
    savedSubject.value = ''
    savedBody.value = ''
  }
  slotDetail.value = detail
}

async function loadRecipientPool(leadId: string): Promise<string> {
  if (!activeProductId.value || !window.ftcs?.getEmailRecipientPool) {
    recipientPool.value = []
    return 'company'
  }
  const res = await window.ftcs.getEmailRecipientPool({
    productId: activeProductId.value,
    leadId,
  })
  if (!res.ok) {
    recipientPool.value = []
    actionMessage.value = res.message || '加载收件人失败'
    return 'company'
  }
  recipientPool.value = res.pool
  const fromRoute = routeRecipientKey()
  if (fromRoute && res.pool.some((p) => p.recipientKey === fromRoute)) {
    return fromRoute
  }
  if (
    selectedRecipientKey.value &&
    res.pool.some((p) => p.recipientKey === selectedRecipientKey.value)
  ) {
    return selectedRecipientKey.value
  }
  return res.defaultRecipientKey || 'company'
}

async function loadCurrentSlot(options?: {
  force?: boolean
  showLoading?: boolean
}): Promise<void> {
  if (!activeProductId.value || !selectedId.value || !window.ftcs?.getEmailDraftSlot) {
    clearEdits()
    return
  }
  const showLoading = options?.showLoading !== false
  if (showLoading) slotLoading.value = true
  try {
    const detail = await window.ftcs.getEmailDraftSlot({
      productId: activeProductId.value,
      leadId: selectedId.value,
      recipientKey: selectedRecipientKey.value || 'company',
    })
    if (!detail.ok) {
      actionMessage.value = detail.message || '读取草稿失败'
      clearEdits()
      return
    }
    hydrateFromSlot(detail, options?.force === true)
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (showLoading) slotLoading.value = false
  }
}

async function selectLead(
  leadId: string,
  options?: { forceSlot?: boolean; showLoading?: boolean },
): Promise<void> {
  selectedId.value = leadId
  const key = await loadRecipientPool(leadId)
  selectedRecipientKey.value = key
  await loadCurrentSlot({
    force: options?.forceSlot !== false,
    showLoading: options?.showLoading,
  })
}

async function applyRecipientKey(nextKey: string, force = true): Promise<void> {
  selectedRecipientKey.value = nextKey
  await loadCurrentSlot({ force, showLoading: true })
}

function requestRecipientSwitch(nextKey: string): void {
  if (nextKey === selectedRecipientKey.value) return
  if (isDirty.value) {
    pendingRecipientKey.value = nextKey
    discardConfirmOpen.value = true
    return
  }
  void applyRecipientKey(nextKey, true)
}

async function confirmDiscardForLeadOrRecipient(): Promise<void> {
  const pending = pendingRecipientKey.value
  discardConfirmOpen.value = false
  pendingRecipientKey.value = ''
  if (pending.startsWith('__lead__:')) {
    await selectLead(pending.slice('__lead__:'.length), { forceSlot: true })
    return
  }
  if (pending) await applyRecipientKey(pending, true)
}

function cancelDiscardSwitch(): void {
  discardConfirmOpen.value = false
  pendingRecipientKey.value = ''
}

async function refreshDrafts(options?: {
  forceHydrate?: boolean
  soft?: boolean
}): Promise<void> {
  if (!window.ftcs?.listEmailDrafts || !activeProductId.value) {
    snapshot.value = null
    selectedId.value = ''
    recipientPool.value = []
    clearEdits()
    return
  }
  const soft = options?.soft === true
  const forceHydrate = options?.forceHydrate === true
  // 轮询软刷新：不闪 loading，且尽量只更新左栏列表
  if (!soft) loading.value = true
  try {
    const fromRoute = routeLeadId()
    // 软刷新用当前选中做 stub；硬刷新才带路由 leadId
    const includeLeadId = soft
      ? selectedId.value || undefined
      : fromRoute || selectedId.value || undefined
    snapshot.value = await window.ftcs.listEmailDrafts(
      activeProductId.value,
      includeLeadId,
    )

    const inList = (id: string): boolean =>
      Boolean(id && snapshot.value?.drafts.some((d) => d.leadId === id))

    let keepLead = ''
    if (soft) {
      // 轮询：保持用户当前选中，绝不因 ?leadId= 跳回
      if (inList(selectedId.value)) keepLead = selectedId.value
      else keepLead = snapshot.value.drafts[0]?.leadId || ''
    } else if (forceHydrate && inList(fromRoute)) {
      keepLead = fromRoute
    } else if (inList(selectedId.value)) {
      keepLead = selectedId.value
    } else if (inList(fromRoute)) {
      keepLead = fromRoute
    } else {
      keepLead = snapshot.value.drafts[0]?.leadId || ''
    }

    if (!keepLead) {
      selectedId.value = ''
      recipientPool.value = []
      clearEdits()
      return
    }

    if (soft && keepLead === selectedId.value && !forceHydrate) {
      // 软刷新：只刷新池标记（有稿/无稿），不强制重写正文、不闪 slotLoading
      await loadRecipientPool(keepLead)
      await loadCurrentSlot({ force: false, showLoading: false })
    } else {
      await selectLead(keepLead, {
        forceSlot: forceHydrate || keepLead !== selectedId.value,
        showLoading: !soft,
      })
    }

    if (fromRoute && !soft && !inList(fromRoute)) {
      actionMessage.value = `未找到线索 ${fromRoute}（可能尚未评分）`
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    if (!soft) snapshot.value = null
  } finally {
    if (!soft) loading.value = false
  }
}

async function onBatchDraft(): Promise<void> {
  if (!activeProductId.value || !window.ftcs?.draftEmails) return
  if (generating.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }
  if (pendingHigh.value.length <= 0) {
    actionMessage.value = '暂无待起草的已评分线索'
    return
  }

  const preflightError = await ensureAgentReady('draft-email')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  try {
    const res = await window.ftcs.draftEmails({
      productId: activeProductId.value,
    })
    if (!res.ok) {
      showToast(res.message, { tone: 'error' })
      return
    }
    drafting.value = true
    resetAgentForDraftEmail(res.acceptedCount ?? pendingHigh.value.length)
    actionMessage.value = res.message
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    agentStatus.value = 'error'
  } finally {
    drafting.value = false
  }
}

async function runSlotDraft(): Promise<void> {
  if (!canSlotDraft.value || !activeProductId.value || !selected.value) return
  if (!window.ftcs?.draftEmailSlot) {
    actionMessage.value = '当前环境不支持单人起草'
    return
  }
  if (generating.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }

  const preflightError = await ensureAgentReady('draft-email')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }

  const item = activePoolItem.value
  const audience = item?.kind === 'person' ? 'person' : 'company'
  drafting.value = true
  actionMessage.value = ''
  resetAgentForDraftEmail(1)
  rewriteConfirmOpen.value = false

  try {
    const res = await window.ftcs.draftEmailSlot({
      productId: activeProductId.value,
      leadId: selected.value.leadId,
      audience,
      email: item?.email || undefined,
      recipientKey: selectedRecipientKey.value,
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

function onSlotDraftClick(): void {
  if (!canSlotDraft.value) return
  if (hasSlotDraft.value) {
    rewriteConfirmOpen.value = true
    return
  }
  void runSlotDraft()
}

async function onSave(): Promise<void> {
  if (!canSave.value || !activeProductId.value || !selected.value) return
  if (!window.ftcs?.saveEmailDraftSlot) {
    actionMessage.value = '当前环境不支持保存草稿'
    return
  }
  saving.value = true
  actionMessage.value = ''
  try {
    const res = await window.ftcs.saveEmailDraftSlot({
      productId: activeProductId.value,
      leadId: selected.value.leadId,
      recipientKey: selectedRecipientKey.value,
      subject: editSubject.value,
      body: editBody.value,
    })
    actionMessage.value = res.message
    if (res.ok) {
      savedSubject.value = editSubject.value
      savedBody.value = editBody.value
      await refreshDrafts({ soft: true })
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function selectDraft(row: EmailDraftRowDto): void {
  if (isDirty.value && row.leadId !== selectedId.value) {
    pendingRecipientKey.value = ''
    // 切换 lead 时也做 dirty 确认：暂复用 discard 对话框，切到该 lead 的默认槽
    discardConfirmOpen.value = true
    pendingRecipientKey.value = `__lead__:${row.leadId}`
    return
  }
  void selectLead(row.leadId, { forceSlot: true })
}

function statusLabel(status: string): string {
  if (status === 'pending_review') return '待审核'
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '已驳回'
  return status || '—'
}

function completionLabel(row: EmailDraftRowDto): string {
  const draftCount = row.draftCount ?? 0
  if (draftCount <= 0) return '无稿'
  const approved = row.approvedCount ?? 0
  return `${approved}/${draftCount} 已通过`
}

/** 左栏审核进度色：未审 / 部分 / 全部 */
function reviewProgressTone(
  row: EmailDraftRowDto,
): 'none' | 'partial' | 'complete' | '' {
  const draftCount = row.draftCount ?? 0
  if (draftCount <= 0) return ''
  const approved = row.approvedCount ?? 0
  if (approved <= 0) return 'none'
  if (approved >= draftCount) return 'complete'
  return 'partial'
}

/** 收件人芯片圆点：灰无稿 / 红待审 / 黄其它 / 绿已通过 */
function chipDraftTone(
  item: EmailRecipientPoolItemDto,
): 'empty' | 'pending' | 'other' | 'approved' {
  if (!item.hasDraft) return 'empty'
  const status = (item.draftStatus || '').trim()
  if (status === 'approved') return 'approved'
  if (status === 'pending_review' || !status) return 'pending'
  return 'other'
}

function chipSecondary(item: EmailRecipientPoolItemDto): string {
  if (item.kind === 'company') {
    const list = item.emails?.length ? item.emails : item.email ? [item.email] : []
    if (list.length === 0) return '无通用邮箱'
    if (list.length === 1) return list[0]!
    return `${list[0]} +${list.length - 1}`
  }
  const title = item.title?.trim()
  if (title) return title.length > 24 ? `${title.slice(0, 24)}…` : title
  return item.email || ''
}

const COMPANY_TO_VISIBLE = 2

const toEmails = computed((): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string | null | undefined) => {
    const email = (raw || '').trim().toLowerCase()
    if (!email || seen.has(email)) return
    seen.add(email)
    out.push(email)
  }

  if (activePoolItem.value?.kind === 'company') {
    for (const e of activePoolItem.value.emails ?? []) push(e)
    push(slotDetail.value?.email)
    for (const a of slotDetail.value?.recipientAliases ?? []) push(a)
    push(activePoolItem.value.email)
    return out
  }

  push(slotDetail.value?.email)
  push(activePoolItem.value?.email)
  return out
})

const toEmailsTitle = computed(() =>
  toEmails.value.length > COMPANY_TO_VISIBLE ? toEmails.value.join('\n') : '',
)

const toEmailsSummary = computed(() => {
  const list = toEmails.value
  if (list.length === 0) {
    return activePoolItem.value?.kind === 'company' ? '（无通用邮箱）' : '—'
  }
  if (list.length <= COMPANY_TO_VISIBLE) return list.join(', ')
  const head = list.slice(0, COMPANY_TO_VISIBLE).join(', ')
  return `${head}`
})

const toEmailsMoreCount = computed(() => {
  const n = toEmails.value.length - COMPANY_TO_VISIBLE
  return n > 0 ? n : 0
})

function openRejectConfirm(): void {
  if (!canReject.value) return
  rejectAllConfirmOpen.value = false
  rejectConfirmOpen.value = true
}

function closeRejectConfirm(): void {
  if (rejecting.value) return
  rejectConfirmOpen.value = false
}

function closeRejectAllConfirm(): void {
  if (rejecting.value) return
  rejectAllConfirmOpen.value = false
}

function openRejectAllConfirm(): void {
  if (rejecting.value) return
  rejectConfirmOpen.value = false
  rejectAllConfirmOpen.value = true
}

function goToLead(): void {
  if (!selected.value?.leadId) return
  router
    .push({ name: 'leads', query: { leadId: selected.value.leadId } })
    .catch(() => undefined)
}

async function runReject(scope: 'slot' | 'lead'): Promise<void> {
  if (!activeProductId.value || !selected.value || !window.ftcs?.rejectEmailDraft) {
    return
  }
  rejecting.value = true
  actionMessage.value = ''
  const leadId = selected.value.leadId
  try {
    const res = await window.ftcs.rejectEmailDraft({
      productId: activeProductId.value,
      leadId,
      scope,
      recipientKey: scope === 'slot' ? selectedRecipientKey.value : undefined,
    })
    actionMessage.value = res.message
    if (!res.ok) return

    rejectConfirmOpen.value = false
    rejectAllConfirmOpen.value = false
    const remaining = res.remainingDraftCount ?? 0
    if (scope === 'lead' || remaining <= 0) {
      selectedId.value = ''
      selectedRecipientKey.value = 'company'
      recipientPool.value = []
      clearEdits()
      await refreshDrafts({ forceHydrate: true })
      return
    }
    // 删当前槽后按默认规则重选收件人
    selectedRecipientKey.value = ''
    clearEdits()
    await refreshDrafts({ forceHydrate: true })
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    rejecting.value = false
  }
}

async function confirmReject(): Promise<void> {
  await runReject('slot')
}

async function confirmRejectAll(): Promise<void> {
  await runReject('lead')
}

async function onApprove(): Promise<void> {
  if (!canApprove.value || !activeProductId.value || !selected.value) return
  if (!window.ftcs?.approveEmailDraft) {
    actionMessage.value = '当前环境不支持通过并保存'
    return
  }
  approving.value = true
  actionMessage.value = ''
  try {
    const res = await window.ftcs.approveEmailDraft({
      productId: activeProductId.value,
      leadId: selected.value.leadId,
      recipientKey: selectedRecipientKey.value,
      subject: editSubject.value,
      body: editBody.value,
    })
    actionMessage.value = res.message
    if (res.ok) {
      savedSubject.value = editSubject.value
      savedBody.value = editBody.value
      await refreshDrafts({ forceHydrate: true })
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    approving.value = false
  }
}

async function onGenerateZh(): Promise<void> {
  if (!canGenerateZh.value || !activeProductId.value || !selected.value) return
  if (isDirty.value) {
    actionMessage.value = '请先保存原文再生成对照'
    return
  }
  if (!window.ftcs?.generateEmailDraftZh) {
    actionMessage.value = '当前环境不支持中文对照'
    return
  }
  if (generating.value) {
    actionMessage.value = '已有 Agent 任务在运行，请稍候'
    return
  }
  const preflightError = await ensureAgentReady('draft-email')
  if (preflightError) {
    actionMessage.value = preflightError
    return
  }
  const leadId = selected.value.leadId
  const recipientKey = selectedRecipientKey.value || 'company'
  resetAgentForTranslateEmail(leadId, recipientKey)
  actionMessage.value = ''
  try {
    const res = await window.ftcs.generateEmailDraftZh({
      productId: activeProductId.value,
      leadId,
      recipientKey,
    })
    actionMessage.value = res.message
    if (!res.ok) return
    zhContrastOpen.value = true
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  }
}

watch(activeProductId, () => {
  actionMessage.value = ''
  selectedId.value = ''
  selectedRecipientKey.value = 'company'
  recipientPool.value = []
  clearEdits()
  void refreshDrafts({ forceHydrate: true })
})

watch(
  () =>
    `${typeof route.query.leadId === 'string' ? route.query.leadId : ''}|${
      typeof route.query.recipientKey === 'string' ? route.query.recipientKey : ''
    }`,
  (next, prev) => {
    if (next === prev) return
    void refreshDrafts({ forceHydrate: true })
  },
)

watch(agentStatus, (status) => {
  if (
    (status === 'done' || status === 'error') &&
    (agentSkill.value === 'draft-outreach-email' ||
      agentSkill.value === 'translate-outreach-email')
  ) {
    void refreshDrafts({ forceHydrate: true }).then(() => {
      if (status === 'done' && agentSkill.value === 'translate-outreach-email') {
        zhContrastOpen.value = true
      }
    })
  }
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  void refreshDrafts({ forceHydrate: true })
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    if (isDirty.value || isBusy.value) return
    void refreshDrafts({ soft: true })
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
            pendingHigh.length > 0
              ? `为 ${pendingHigh.length} 条已评分线索批量起草`
              : '暂无待起草的已评分线索'
          "
          @click="onBatchDraft"
        >
          {{ isDrafting && !selected ? '起草中…' : `批量起草${pendingHigh.length ? ` ${pendingHigh.length}` : ''}` }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canSlotDraft"
          :title="hasSlotDraft ? '仅重写当前收件人草稿' : '仅为当前收件人起草'"
          @click="onSlotDraftClick"
        >
          {{ slotActionLabel }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canViewLead"
          title="在线索页打开当前公司"
          @click="goToLead"
        >
          查看线索
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canSave"
          title="保存当前收件人编辑（不改审批状态）"
          @click="onSave"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canReject"
          title="驳回当前收件人的开发信"
          @click="openRejectConfirm"
        >
          {{ rejecting ? '驳回中…' : '驳回' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canApprove"
          title="通过并保存当前收件人草稿（不发送）"
          @click="onApprove"
        >
          <Icon name="check" :size="12" />
          {{ approving ? '保存中…' : '通过' }}
        </button>
      </div>
    </header>

    <div class="email-layout">
      <aside class="draft-list">
        <div class="draft-list__head">
          草稿队列
          <span v-if="stats.total"> · {{ stats.total }}</span>
        </div>
        <p v-if="loading && !snapshot" class="muted draft-list__empty">加载中…</p>
        <p v-else-if="!activeProductId" class="muted draft-list__empty">未选择产品</p>
        <p v-else-if="drafts.length === 0" class="muted draft-list__empty">
          暂无草稿
          <template v-if="pendingHigh.length > 0">
            · 可点击「批量起草」
          </template>
        </p>
        <button
          v-for="row in drafts"
          :key="row.leadId"
          type="button"
          class="draft-list__item"
          :class="{
            'is-active': selected?.leadId === row.leadId,
            'is-review-none': reviewProgressTone(row) === 'none',
            'is-review-partial': reviewProgressTone(row) === 'partial',
            'is-review-complete': reviewProgressTone(row) === 'complete',
          }"
          @click="selectDraft(row)"
        >
          <span class="draft-list__company">{{ row.companyName }}</span>
          <span class="draft-list__subject">
            {{ row.subject || (row.draftCount ? '（无主题）' : '尚未起草') }}
          </span>
          <span class="draft-list__meta">
            {{ completionLabel(row) }}
            <template v-if="row.draftCount"> · {{ statusLabel(row.status) }}</template>
            <template v-if="row.tier"> · {{ row.tier }}</template>
          </span>
        </button>
      </aside>

      <div v-if="selected" class="email-preview">
        <div class="recipient-chips" role="tablist" aria-label="收件人">
          <button
            v-for="item in recipientPool"
            :key="item.recipientKey"
            type="button"
            class="recipient-chip"
            :class="{
              'is-active': item.recipientKey === selectedRecipientKey,
              'is-empty': !item.hasDraft,
            }"
            :disabled="isBusy"
            role="tab"
            :aria-selected="item.recipientKey === selectedRecipientKey"
            @click="requestRecipientSwitch(item.recipientKey)"
          >
            <span
              class="recipient-chip__dot"
              :class="`is-${chipDraftTone(item)}`"
            />
            <span class="recipient-chip__text">
              <span class="recipient-chip__name">{{ item.displayName }}</span>
              <span class="recipient-chip__sub muted">{{ chipSecondary(item) }}</span>
            </span>
          </button>
        </div>

        <p v-if="stylePromptPreview" class="email-preview__style muted">
          生成时风格：{{ stylePromptPreview }}
        </p>

        <template v-if="hasSlotDraft">
          <dl class="email-preview__fields">
            <div class="email-preview__field email-preview__field--to-company">
              <div class="email-preview__meta-block email-preview__meta-block--to">
                <dt>To</dt>
                <dd
                  class="email-preview__to"
                  :class="{ 'has-more': toEmailsMoreCount > 0 }"
                  :title="toEmailsTitle || toEmailsSummary || undefined"
                >
                  <span class="email-preview__to-text">{{ toEmailsSummary }}</span>
                  <span v-if="toEmailsMoreCount > 0" class="email-preview__to-more">
                    +{{ toEmailsMoreCount }}
                  </span>
                </dd>
              </div>
              <div class="email-preview__meta-block email-preview__meta-block--company">
                <dt>Company</dt>
                <dd
                  class="email-preview__company"
                  :title="selected.companyName || undefined"
                >
                  {{ selected.companyName }}
                </dd>
              </div>
            </div>
            <div class="email-preview__field email-preview__field--full">
              <dt>Subject</dt>
              <dd>
                <input
                  v-model="editSubject"
                  type="text"
                  class="email-preview__input"
                  :disabled="isBusy"
                  placeholder="邮件主题"
                />
              </dd>
            </div>
          </dl>

          <div class="email-preview__body">
            <textarea
              v-model="editBody"
              class="email-preview__textarea"
              :disabled="isBusy"
              placeholder="邮件正文"
              spellcheck="false"
            />
          </div>

          <div class="email-zh-contrast">
            <button
              type="button"
              class="email-zh-contrast__toggle"
              :aria-expanded="zhContrastOpen"
              @click="zhContrastOpen = !zhContrastOpen"
            >
              <span>{{ zhContrastOpen ? '▾' : '▸' }}</span>
              <span>中文对照（辅助审阅，外发仍用原文）</span>
              <span class="muted email-zh-contrast__badge">
                {{
                  hasZhContrast
                    ? zhContrastStale
                      ? '可能过期'
                      : '已生成'
                    : '未生成'
                }}
              </span>
            </button>
            <div v-if="zhContrastOpen" class="email-zh-contrast__panel">
              <p v-if="zhContrastStale" class="email-zh-contrast__stale">
                原文已更新，对照可能过期，建议刷新。
              </p>
              <p v-else-if="hasZhContrast && slotDetail?.zhStale === false" class="sr-only">
                对照与原文一致
              </p>
              <dl v-if="hasZhContrast" class="email-zh-contrast__fields">
                <div>
                  <dt>中文主题</dt>
                  <dd>{{ slotDetail?.subjectZh || '—' }}</dd>
                </div>
                <div>
                  <dt>中文正文</dt>
                  <dd class="email-zh-contrast__body">{{ slotDetail?.bodyZh || '—' }}</dd>
                </div>
              </dl>
              <p v-else class="muted email-zh-contrast__empty">尚未生成中文对照</p>
              <button
                type="button"
                class="btn-secondary btn-sm"
                :disabled="!canGenerateZh"
                :title="
                  isDirty
                    ? '请先保存原文再生成对照'
                    : hasZhContrast
                      ? '根据当前外文重新翻译'
                      : '为当前收件人生成中文对照'
                "
                @click="onGenerateZh"
              >
                {{ zhActionLabel }}
              </button>
            </div>
          </div>

          <section
            v-if="slotDetail?.personalizationEvidence?.length"
            class="email-preview__evidence"
          >
            <h4>personalization_evidence</h4>
            <ul>
              <li
                v-for="(item, i) in slotDetail.personalizationEvidence"
                :key="i"
              >
                {{ item }}
              </li>
            </ul>
          </section>
        </template>

        <div v-else class="email-preview__slot-empty">
          <p class="email-preview__slot-empty-title">
            {{ slotLoading ? '加载中…' : '该收件人尚无开发信' }}
          </p>
          <p v-if="!slotLoading" class="muted">{{ emptyStateHint }}</p>
          <button
            v-if="!slotLoading"
            type="button"
            class="btn-primary"
            :disabled="!canSlotDraft"
            @click="onSlotDraftClick"
          >
            为该收件人起草
          </button>
        </div>
      </div>

      <div v-else class="email-preview email-preview--empty">
        <p>{{ loading ? '加载草稿中…' : '选择左侧线索查看收件人与正文' }}</p>
        <p class="muted">
          整 lead 批量起草可用顶栏「批量起草」；单人补洞在选定收件人后起草
        </p>
      </div>
    </div>

    <ConfirmDialog
      :open="rejectConfirmOpen"
      title="驳回当前收件人"
      :message="rejectConfirmMessage"
      confirm-label="确认驳回"
      cancel-label="取消"
      secondary-label="驳回本线索全部开发信…"
      danger
      :busy="rejecting"
      @confirm="confirmReject"
      @secondary="openRejectAllConfirm"
      @cancel="closeRejectConfirm"
    />
    <ConfirmDialog
      :open="rejectAllConfirmOpen"
      title="驳回本线索全部开发信"
      :message="rejectAllConfirmMessage"
      confirm-label="确认全部驳回"
      cancel-label="取消"
      danger
      :busy="rejecting"
      @confirm="confirmRejectAll"
      @cancel="closeRejectAllConfirm"
    />
    <ConfirmDialog
      :open="rewriteConfirmOpen"
      title="重写当前收件人"
      message="将覆盖该收件人当前草稿，确定继续？"
      confirm-label="确认重写"
      cancel-label="取消"
      :busy="isDrafting"
      @confirm="runSlotDraft"
      @cancel="rewriteConfirmOpen = false"
    />
    <ConfirmDialog
      :open="discardConfirmOpen"
      title="放弃未保存修改？"
      message="当前收件人有未保存的编辑，切换后将丢失。"
      confirm-label="放弃并切换"
      cancel-label="取消"
      danger
      @confirm="confirmDiscardForLeadOrRecipient"
      @cancel="cancelDiscardSwitch"
    />
  </section>
</template>
