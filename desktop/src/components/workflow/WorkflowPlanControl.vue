<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { useWorkflowPlanSelection } from '../../composables/useWorkflowPlanSelection'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    disabled?: boolean
    disabledReason?: string
    executing?: boolean
    maxQueriesLimit?: number | null
    selectedPlanId?: string
  }>(),
  {
    compact: true,
    disabled: false,
    disabledReason: '',
    executing: false,
    maxQueriesLimit: null,
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

const selectDisabled = computed(() => loading.value || props.executing)

const runDisabled = computed(
  () =>
    loading.value ||
    props.executing ||
    props.disabled ||
    plans.value.length === 0 ||
    Boolean(loadError.value) ||
    !selectedPlanId.value,
)

const runLabel = computed(() => (props.executing ? '执行中…' : '执行'))

const runTitle = computed(() => {
  if (loadError.value) return loadError.value
  if (props.executing) return '方案执行中'
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
