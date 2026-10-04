<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { WORKFLOW_NODE_OPTIONS } from '../../constants/workflow-node-labels'
import {
  addEditorStep,
  createDefaultEditorDraft,
  editorModeProducesSaveInput,
  moveEditorStep,
  planToEditorDraft,
  removeEditorStep,
  saveInputForEditorMode,
  validateWorkflowPlanDraft,
  WORKFLOW_PLAN_MAX_STEPS,
  type WorkflowPlanEditorMode,
  type WorkflowPlanEditorStepDraft,
} from '../../composables/useWorkflowPlanEditor'
import type { WorkflowNodeId, WorkflowPlan } from '../../types/electron'
import Icon from '../shared/Icon.vue'

const props = defineProps<{
  open: boolean
  mode: WorkflowPlanEditorMode
  initialPlan?: WorkflowPlan
  existingPlans?: WorkflowPlan[]
}>()

const emit = defineEmits<{
  close: []
  saved: [plan: WorkflowPlan]
}>()

const name = ref('')
const steps = ref<WorkflowPlanEditorStepDraft[]>([])
const error = ref('')
const saving = ref(false)

const isView = computed(() => props.mode === 'view')
const title = computed(() => {
  if (props.mode === 'create') return '新建方案'
  if (props.mode === 'view') return '查看方案'
  return '编辑方案'
})
const hint = computed(() =>
  isView.value
    ? '步骤按该方案的顺序执行'
    : `步骤将按顺序执行；最多 ${WORKFLOW_PLAN_MAX_STEPS} 步`,
)
const editingId = computed(() =>
  props.mode === 'edit' ? props.initialPlan?.id : undefined,
)
const canAddStep = computed(() => steps.value.length < WORKFLOW_PLAN_MAX_STEPS)

function resetForm(): void {
  error.value = ''
  saving.value = false
  if (props.mode === 'edit' || props.mode === 'view') {
    if (!props.initialPlan) {
      name.value = ''
      steps.value = []
      return
    }
    const draft = planToEditorDraft(props.initialPlan)
    name.value = draft.name
    steps.value = draft.steps
    return
  }
  const draft = createDefaultEditorDraft()
  name.value = draft.name
  steps.value = draft.steps
}

function onAddStep(): void {
  if (isView.value) return
  steps.value = addEditorStep(steps.value)
}

function onRemoveStep(index: number): void {
  if (isView.value) return
  steps.value = removeEditorStep(steps.value, index)
}

function onMoveStep(index: number, direction: 'up' | 'down'): void {
  if (isView.value) return
  steps.value = moveEditorStep(steps.value, index, direction)
}

function onNodeChange(index: number, event: Event): void {
  if (isView.value) return
  const value = (event.target as HTMLSelectElement).value as WorkflowNodeId
  steps.value = steps.value.map((step, i) =>
    i === index ? { ...step, nodeId: value } : step,
  )
}

function requestClose(): void {
  if (saving.value && !isView.value) return
  emit('close')
}

async function onSave(): Promise<void> {
  if (!editorModeProducesSaveInput(props.mode)) return
  if (saving.value || !window.ftcs?.saveWorkflowPlan) return

  const validationError = validateWorkflowPlanDraft({
    name: name.value,
    steps: steps.value,
    existingPlans: props.existingPlans,
    editingId: editingId.value,
  })
  if (validationError) {
    error.value = validationError
    return
  }

  const input = saveInputForEditorMode(props.mode, {
    name: name.value,
    steps: steps.value,
    editingId: editingId.value,
  })
  if (!input) return

  saving.value = true
  error.value = ''
  try {
    const res = await window.ftcs.saveWorkflowPlan(input)
    if (!res.ok || !res.plan) {
      error.value = res.message ?? '保存失败'
      return
    }
    emit('saved', res.plan)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (saving.value && !isView.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) resetForm()
  },
)

watch(
  () => [props.mode, props.initialPlan?.id] as const,
  () => {
    if (props.open) resetForm()
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="workflow-plan-editor"
      :class="{ 'workflow-plan-editor--view': isView }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <button
        type="button"
        class="workflow-plan-editor__backdrop"
        aria-label="关闭"
        :disabled="saving && !isView"
        @click="requestClose"
      />
      <div class="workflow-plan-editor__panel">
        <header class="workflow-plan-editor__head">
          <div>
            <h2>{{ title }}</h2>
            <p>{{ hint }}</p>
          </div>
          <button
            v-if="isView"
            type="button"
            class="workflow-plan-editor__close"
            aria-label="关闭"
            @click="requestClose"
          >
            <Icon name="x" :size="14" />
          </button>
        </header>

        <label class="workflow-plan-editor__field">
          <span class="workflow-plan-editor__label">方案名称</span>
          <input
            v-model="name"
            class="text-input"
            type="text"
            maxlength="40"
            placeholder="例如：仅 R1 探索"
            :readonly="isView"
            :disabled="!isView && saving"
          />
        </label>

        <div class="workflow-plan-editor__steps">
          <div class="workflow-plan-editor__steps-head">步骤（按顺序执行）</div>
          <ul class="workflow-plan-editor__list">
            <li v-for="(step, index) in steps" :key="step.key" class="workflow-plan-editor__row">
              <span class="workflow-plan-editor__index">{{ index + 1 }}.</span>
              <select
                class="text-input workflow-plan-editor__node"
                :value="step.nodeId"
                :disabled="isView || saving"
                @change="onNodeChange(index, $event)"
              >
                <option v-for="opt in WORKFLOW_NODE_OPTIONS" :key="opt.id" :value="opt.id">
                  {{ opt.label }}
                </option>
              </select>
              <div v-if="!isView" class="workflow-plan-editor__row-actions">
                <button
                  type="button"
                  class="btn-secondary btn-secondary--sm"
                  :disabled="saving || index === 0"
                  title="上移"
                  @click="onMoveStep(index, 'up')"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="btn-secondary btn-secondary--sm"
                  :disabled="saving || index === steps.length - 1"
                  title="下移"
                  @click="onMoveStep(index, 'down')"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="btn-secondary btn-secondary--sm"
                  :disabled="saving || steps.length <= 1"
                  title="删除步骤"
                  @click="onRemoveStep(index)"
                >
                  删
                </button>
              </div>
            </li>
          </ul>
          <button
            v-if="!isView"
            type="button"
            class="btn-secondary workflow-plan-editor__add"
            :disabled="saving || !canAddStep"
            @click="onAddStep"
          >
            + 添加步骤
          </button>
        </div>

        <p v-if="error" class="workflow-plan-editor__error">{{ error }}</p>

        <footer class="workflow-plan-editor__foot">
          <button v-if="isView" type="button" class="btn-secondary" @click="requestClose">
            关闭
          </button>
          <template v-else>
            <button type="button" class="btn-secondary" :disabled="saving" @click="requestClose">
              取消
            </button>
            <button type="button" class="btn-primary" :disabled="saving" @click="onSave">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
