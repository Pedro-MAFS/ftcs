<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import Icon from '../components/shared/Icon.vue'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'
import type { EmailDraftRowDto, EmailDraftsSnapshotDto } from '../types/electron'

type VariantKey = 'short' | 'professional'

const meta = SECTION_META.email
const route = useRoute()
const {
  activeProductId,
  generating,
  agentSkill,
  agentStatus,
  resetAgentForDraftEmail,
} = useWorkspace()

const loading = ref(false)
const drafting = ref(false)
const rejecting = ref(false)
const approving = ref(false)
const rejectConfirmOpen = ref(false)
const actionMessage = ref('')
const snapshot = ref<EmailDraftsSnapshotDto | null>(null)
const selectedId = ref('')
const activeVariant = ref<VariantKey>('short')

/** 本地改稿缓冲；轮询刷新同一 lead 时不覆盖 */
const editLeadId = ref('')
const editSubjects = ref<Record<VariantKey, string>>({
  short: '',
  professional: '',
})
const editBodies = ref<Record<VariantKey, string>>({
  short: '',
  professional: '',
})

const emptyStats = { total: 0, pendingReview: 0, pendingHigh: 0 }

const stats = computed(() => snapshot.value?.stats ?? emptyStats)
const drafts = computed(() => snapshot.value?.drafts ?? [])
const pendingHigh = computed(() => snapshot.value?.pendingHighLeadIds ?? [])

const selected = computed(() => {
  if (!selectedId.value) return drafts.value[0] ?? null
  return drafts.value.find((d) => d.leadId === selectedId.value) ?? null
})

const isDrafting = computed(
  () =>
    drafting.value ||
    (generating.value && agentSkill.value === 'draft-outreach-email'),
)

const isBusy = computed(
  () => isDrafting.value || generating.value || rejecting.value || approving.value,
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
    !isBusy.value,
)

const canApprove = computed(
  () =>
    !!activeProductId.value &&
    !!selected.value &&
    !isBusy.value,
)

const rejectConfirmMessage = computed(() => {
  const draft = selected.value
  if (!draft) return ''
  return `确定驳回「${draft.companyName}」的开发信吗？将删除邮件草稿，并把线索状态回退为 new。`
})

const subtitle = computed(() => {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  const s = stats.value
  if (s.total === 0) {
    return pendingHigh.value.length > 0
      ? `暂无草稿 · ${pendingHigh.value.length} 条已评分线索可批量起草`
      : '暂无草稿 · 请先在线索页完成评分，再批量起草开发信'
  }
  return `${s.total} 封草稿 · 待审 ${s.pendingReview} · 待起草 ${s.pendingHigh}`
})

const editSubject = computed({
  get: () => editSubjects.value[activeVariant.value],
  set: (value: string) => {
    editSubjects.value = {
      ...editSubjects.value,
      [activeVariant.value]: value,
    }
  },
})

const editBody = computed({
  get: () => editBodies.value[activeVariant.value],
  set: (value: string) => {
    editBodies.value = {
      ...editBodies.value,
      [activeVariant.value]: value,
    }
  },
})

function hydrateEdits(draft: EmailDraftRowDto, force: boolean): void {
  if (!force && editLeadId.value === draft.leadId) return
  editLeadId.value = draft.leadId
  const nextSubjects: Record<VariantKey, string> = {
    short: '',
    professional: '',
  }
  const nextBodies: Record<VariantKey, string> = {
    short: '',
    professional: '',
  }
  for (const key of ['short', 'professional'] as const) {
    const variant = draft.variants.find((v) => v.type === key)
    nextSubjects[key] = variant?.subject ?? ''
    nextBodies[key] = variant?.body ?? ''
  }
  editSubjects.value = nextSubjects
  editBodies.value = nextBodies
}

function clearEdits(): void {
  editLeadId.value = ''
  editSubjects.value = { short: '', professional: '' }
  editBodies.value = { short: '', professional: '' }
}

function routeLeadId(): string {
  const q = route.query.leadId
  if (typeof q === 'string') return q.trim()
  if (Array.isArray(q) && typeof q[0] === 'string') return q[0].trim()
  return ''
}

/** 从线索页跳转时选中对应草稿 */
function applyRouteSelection(forceHydrate: boolean): boolean {
  const leadId = routeLeadId()
  if (!leadId || !snapshot.value) return false
  const draft = snapshot.value.drafts.find((d) => d.leadId === leadId)
  if (!draft) return false
  selectedId.value = leadId
  activeVariant.value =
    draft.selectedVariant === 'professional' ? 'professional' : 'short'
  hydrateEdits(draft, forceHydrate || editLeadId.value !== leadId)
  return true
}

async function refreshDrafts(options?: { forceHydrate?: boolean }): Promise<void> {
  if (!window.ftcs?.listEmailDrafts || !activeProductId.value) {
    snapshot.value = null
    selectedId.value = ''
    clearEdits()
    return
  }
  loading.value = true
  try {
    snapshot.value = await window.ftcs.listEmailDrafts(activeProductId.value)

    const fromRoute = routeLeadId()
    if (fromRoute && snapshot.value.drafts.some((d) => d.leadId === fromRoute)) {
      applyRouteSelection(options?.forceHydrate === true)
    } else if (
      selectedId.value &&
      !snapshot.value.drafts.some((d) => d.leadId === selectedId.value)
    ) {
      selectedId.value = snapshot.value.drafts[0]?.leadId ?? ''
      clearEdits()
    } else if (!selectedId.value && snapshot.value.drafts[0]) {
      selectedId.value = snapshot.value.drafts[0].leadId
    }

    const draft =
      snapshot.value.drafts.find((d) => d.leadId === selectedId.value) ??
      snapshot.value.drafts[0] ??
      null
    if (draft) {
      hydrateEdits(draft, options?.forceHydrate === true)
    } else {
      clearEdits()
    }

    if (fromRoute && !snapshot.value.drafts.some((d) => d.leadId === fromRoute)) {
      actionMessage.value = `未找到线索 ${fromRoute} 的邮件草稿`
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
    snapshot.value = null
  } finally {
    loading.value = false
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

  drafting.value = true
  actionMessage.value = ''
  resetAgentForDraftEmail(pendingHigh.value.length)

  try {
    const res = await window.ftcs.draftEmails({
      productId: activeProductId.value,
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

function selectDraft(row: EmailDraftRowDto): void {
  selectedId.value = row.leadId
  activeVariant.value =
    row.selectedVariant === 'professional' ? 'professional' : 'short'
  hydrateEdits(row, true)
}

function statusLabel(status: string): string {
  if (status === 'pending_review') return '待审核'
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '已驳回'
  return status || '—'
}

function openRejectConfirm(): void {
  if (!canReject.value) return
  rejectConfirmOpen.value = true
}

function closeRejectConfirm(): void {
  if (rejecting.value) return
  rejectConfirmOpen.value = false
}

async function confirmReject(): Promise<void> {
  if (!activeProductId.value || !selected.value || !window.ftcs?.rejectEmailDraft) {
    return
  }
  rejecting.value = true
  actionMessage.value = ''
  try {
    const res = await window.ftcs.rejectEmailDraft({
      productId: activeProductId.value,
      leadId: selected.value.leadId,
    })
    actionMessage.value = res.message
    if (res.ok) {
      rejectConfirmOpen.value = false
      selectedId.value = ''
      clearEdits()
      await refreshDrafts({ forceHydrate: true })
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    rejecting.value = false
  }
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
      selectedVariant: activeVariant.value,
      variants: [
        {
          type: 'short',
          subject: editSubjects.value.short,
          body: editBodies.value.short,
        },
        {
          type: 'professional',
          subject: editSubjects.value.professional,
          body: editBodies.value.professional,
        },
      ],
    })
    actionMessage.value = res.message
    if (res.ok) {
      await refreshDrafts({ forceHydrate: true })
    }
  } catch (err) {
    actionMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    approving.value = false
  }
}

watch(activeProductId, () => {
  actionMessage.value = ''
  selectedId.value = ''
  clearEdits()
  void refreshDrafts({ forceHydrate: true })
})

watch(
  () => route.query.leadId,
  () => {
    if (!snapshot.value) {
      void refreshDrafts({ forceHydrate: true })
      return
    }
    applyRouteSelection(true)
  },
)

watch(agentStatus, (status) => {
  if (
    (status === 'done' || status === 'error') &&
    agentSkill.value === 'draft-outreach-email'
  ) {
    void refreshDrafts({ forceHydrate: true })
  }
})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  void refreshDrafts({ forceHydrate: true })
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshDrafts()
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
          :disabled="!canBatchDraft"
          :title="
            pendingHigh.length > 0
              ? `为 ${pendingHigh.length} 条已评分线索批量起草`
              : '暂无待起草的已评分线索'
          "
          @click="onBatchDraft"
        >
          {{ isDrafting ? '起草中…' : `批量起草${pendingHigh.length ? ` ${pendingHigh.length}` : ''}` }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canReject"
          title="驳回当前草稿：删除邮件文件，线索回退为 new"
          @click="openRejectConfirm"
        >
          {{ rejecting ? '驳回中…' : '驳回' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!canApprove"
          title="保存当前编辑内容，选用当前变体并标记为已通过（不发送）"
          @click="onApprove"
        >
          <Icon name="check" :size="12" />
          {{ approving ? '保存中…' : '通过并保存' }}
        </button>
      </div>
    </header>

    <p v-if="actionMessage" class="leads-banner">{{ actionMessage }}</p>

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
          :class="{ 'is-active': selected?.leadId === row.leadId }"
          @click="selectDraft(row)"
        >
          <span class="draft-list__company">{{ row.companyName }}</span>
          <span class="draft-list__subject">{{ row.subject || '（无主题）' }}</span>
          <span class="draft-list__meta">
            {{ statusLabel(row.status) }}
            <template v-if="row.tier"> · {{ row.tier }}</template>
          </span>
        </button>
      </aside>

      <div v-if="selected" class="email-preview">
        <div class="email-preview__toolbar">
          <button
            type="button"
            class="filter-chip"
            :class="{ 'is-active': activeVariant === 'short' }"
            :disabled="isBusy"
            @click="activeVariant = 'short'"
          >
            short
          </button>
          <button
            type="button"
            class="filter-chip"
            :class="{ 'is-active': activeVariant === 'professional' }"
            :disabled="isBusy"
            @click="activeVariant = 'professional'"
          >
            professional
          </button>
          <span class="email-preview__path muted">{{ selected.draftPath }}</span>
        </div>

        <dl class="email-preview__fields">
          <div class="email-preview__field">
            <dt>To</dt>
            <dd>{{ selected.recipientEmail || '—' }}</dd>
          </div>
          <div class="email-preview__field">
            <dt>Company</dt>
            <dd>{{ selected.companyName }}</dd>
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
          <div class="email-preview__field">
            <dt>Language</dt>
            <dd>{{ selected.language || 'en' }}</dd>
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

        <section v-if="selected.personalizationEvidence.length" class="email-preview__evidence">
          <h4>personalization_evidence</h4>
          <ul>
            <li
              v-for="(item, i) in selected.personalizationEvidence"
              :key="i"
            >
              {{ item }}
            </li>
          </ul>
        </section>
      </div>

      <div v-else class="email-preview email-preview--empty">
        <p>{{ loading ? '加载草稿中…' : '选择左侧草稿查看内容' }}</p>
        <p class="muted">
          单条起草请在线索页对已评分线索点击「写邮件」
        </p>
      </div>
    </div>

    <ConfirmDialog
      :open="rejectConfirmOpen"
      title="驳回开发信"
      :message="rejectConfirmMessage"
      confirm-label="确认驳回"
      cancel-label="取消"
      danger
      :busy="rejecting"
      @confirm="confirmReject"
      @cancel="closeRejectConfirm"
    />
  </section>
</template>
