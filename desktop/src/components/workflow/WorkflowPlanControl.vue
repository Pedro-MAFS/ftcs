<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { useWorkflowPlanSelection } from '../../composables/useWorkflowPlanSelection'
import { useWorkspace } from '../../composables/useWorkspace'
import { useExploreStart } from '../../composables/useExploreStart'
import { parseCompanyDomain } from '../../utils/parse-company-domain'
import type { WorkflowNodeId } from '../../types/electron'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    disabled?: boolean
    disabledReason?: string
    executing?: boolean
    selectedPlanId?: string
  }>(),
  {
    compact: true,
    disabled: false,
    disabledReason: '',
    executing: false,
  },
)

const emit = defineEmits<{
  execute: [planId: string]
  'update:selectedPlanId': [planId: string]
}>()

const {
  plans,
  loading,
  loadError,
  selectedPlanId,
  selectedPlan,
  reloadPlans,
  onSelectPlan,
  selectPlanId,
} = useWorkflowPlanSelection({
  onSelectedPlanIdChange: (planId) => emit('update:selectedPlanId', planId),
})

const {
  activeProductId,
  currentProfile,
  leadsSnapshot,
  emailDraftsSnapshot,
  generating,
} = useWorkspace()

const explore = useExploreStart()

function assertStepReadyInline(nodeId: WorkflowNodeId): string | null {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  if (generating.value) return '已有任务在运行'

  switch (nodeId) {
    case 'expand-keywords':
      if (currentProfile.value?.status !== 'ready') {
        return '画像未就绪，请补全必填字段后再执行'
      }
      return null
    case 'discover-r1':
      if (!explore.canStartR1.value) return explore.startR1DisabledReason.value || '无法开始 R1 探索'
      return null
    case 'discover-r2':
      if (!explore.canStartR2.value) return explore.startR2DisabledReason.value || '无法开始 R2 探索'
      return null
    case 'discover-r3':
      if (!explore.canStartR3.value) return explore.startR3DisabledReason.value || '无法开始 R3 探索'
      return null
    case 'score-and-dedupe': {
      const raw = leadsSnapshot.value?.stats.raw ?? 0
      if (raw <= 0) return '暂无未评分原始线索，请先完成探索'
      return null
    }
    case 'draft-outreach-email': {
      const pending = emailDraftsSnapshot.value?.pendingHighLeadIds.length ?? 0
      if (pending <= 0) return '暂无待起草的已评分线索'
      return null
    }
    case 'enrich-lead-contacts': {
      const pending = (leadsSnapshot.value?.rows ?? []).filter(
        (row) =>
          row.phase === 'scored' &&
          Boolean(parseCompanyDomain(row.company?.website || row.domain)) &&
          (!row.people || row.people.length === 0),
      ).length
      if (pending <= 0) {
        return '暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）'
      }
      return null
    }
    default:
      return null
  }
}

const preExecuteReason = computed(() => {
  const plan = selectedPlan.value
  if (!plan) return ''
  for (const step of plan.steps) {
    const reason = assertStepReadyInline(step.nodeId)
    if (reason) return reason
  }
  return ''
})

const selectDisabled = computed(() => loading.value || props.executing)

const runDisabled = computed(
  () =>
    loading.value ||
    props.executing ||
    props.disabled ||
    plans.value.length === 0 ||
    Boolean(loadError.value) ||
    !selectedPlanId.value ||
    Boolean(preExecuteReason.value),
)

const runLabel = computed(() => (props.executing ? '执行中…' : '执行'))

const runTitle = computed(() => {
  if (loadError.value) return loadError.value
  if (props.executing) return '方案执行中'
  if (preExecuteReason.value) return preExecuteReason.value
  if (props.disabled && props.disabledReason) return props.disabledReason
  if (selectedPlan.value) return `执行方案「${selectedPlan.value.name}」`
  return '执行'
})

function onPlanChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (!value) return
  onSelectPlan(value)
}

function onExecuteClick(): void {
  if (runDisabled.value || !selectedPlanId.value) return
  emit('execute', selectedPlanId.value)
}

watch(
  () => props.selectedPlanId,
  (value) => {
    if (!value || value === selectedPlanId.value) return
    if (plans.value.some((plan) => plan.id === value)) {
      selectPlanId(value)
    }
  },
)

onMounted(() => {
  void reloadPlans(props.selectedPlanId)
})

defineExpose({
  reloadPlans,
  selectPlanId,
  getSelectedPlan: () => selectedPlan.value,
  getPlans: () => plans.value,
})
</script>

<template>
  <div class="workflow-plan-control" :class="{ 'is-compact': props.compact }">
    <select
      class="text-input workflow-plan-control__select"
      :value="selectedPlanId"
      :disabled="selectDisabled"
      aria-label="选择任务方案"
      @change="onPlanChange"
    >
      <option v-if="loading" value="" disabled>加载方案…</option>
      <option v-else-if="loadError" value="" disabled>无法加载方案</option>
      <option v-for="plan in plans" :key="plan.id" :value="plan.id">
        {{ plan.name }}
      </option>
    </select>
    <slot name="menu" />
    <button
      type="button"
      class="btn-primary workflow-plan-control__run"
      :class="{ 'btn-secondary--sm': props.compact }"
      :disabled="runDisabled"
      :title="runTitle"
      @click="onExecuteClick"
    >
      <Icon name="play" :size="props.compact ? 11 : 12" />
      {{ runLabel }}
    </button>
  </div>
</template>
