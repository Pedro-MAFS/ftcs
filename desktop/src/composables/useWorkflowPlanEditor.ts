import { isWorkflowNodeIdValue } from '../constants/workflow-node-labels'
import type { WorkflowNodeId, WorkflowPlan, WorkflowPlanSaveInput } from '../types/electron'

export type WorkflowPlanEditorMode = 'create' | 'edit' | 'view'

export type WorkflowPlanEditorStepDraft = {
  key: string
  nodeId: WorkflowNodeId
}

export const WORKFLOW_PLAN_MAX_STEPS = 10

let stepKeySeq = 0

function nextStepKey(): string {
  stepKeySeq += 1
  return `step_${stepKeySeq}_${Date.now()}`
}

export function createEditorStep(nodeId: WorkflowNodeId = 'discover-r1'): WorkflowPlanEditorStepDraft {
  return { key: nextStepKey(), nodeId }
}

export function createDefaultEditorDraft(): {
  name: string
  steps: WorkflowPlanEditorStepDraft[]
} {
  return {
    name: '',
    steps: [createEditorStep('discover-r1')],
  }
}

export function planToEditorDraft(plan: WorkflowPlan): {
  name: string
  steps: WorkflowPlanEditorStepDraft[]
} {
  return {
    name: plan.name,
    steps: plan.steps.map((step) => ({
      key: nextStepKey(),
      nodeId: step.nodeId,
    })),
  }
}

function normalizePlanName(name: string): string {
  return name.trim()
}

export function validateWorkflowPlanDraft(input: {
  name: string
  steps: WorkflowPlanEditorStepDraft[]
  existingPlans?: WorkflowPlan[]
  editingId?: string
}): string | null {
  const name = normalizePlanName(input.name)
  if (!name) return '请输入方案名称'
  if (name.length > 40) return '方案名称须为 1～40 个字符'

  const userPlans = (input.existingPlans ?? []).filter((plan) => !plan.builtin)
  const normalized = name.toLocaleLowerCase('zh-CN')
  const conflict = userPlans.find(
    (plan) =>
      plan.id !== input.editingId &&
      normalizePlanName(plan.name).toLocaleLowerCase('zh-CN') === normalized,
  )
  if (conflict) return `已存在同名方案「${conflict.name}」`

  if (input.steps.length < 1 || input.steps.length > WORKFLOW_PLAN_MAX_STEPS) {
    return '方案须包含 1～10 个步骤'
  }

  for (const step of input.steps) {
    if (!isWorkflowNodeIdValue(step.nodeId)) {
      return `未知步骤：${step.nodeId || '(空)'}`
    }
  }

  return null
}

export function moveEditorStep(
  steps: WorkflowPlanEditorStepDraft[],
  index: number,
  direction: 'up' | 'down',
): WorkflowPlanEditorStepDraft[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= steps.length) return steps
  const next = [...steps]
  const tmp = next[index]
  next[index] = next[target]
  next[target] = tmp
  return next
}

export function addEditorStep(
  steps: WorkflowPlanEditorStepDraft[],
  nodeId: WorkflowNodeId = 'discover-r1',
): WorkflowPlanEditorStepDraft[] {
  if (steps.length >= WORKFLOW_PLAN_MAX_STEPS) return steps
  return [...steps, createEditorStep(nodeId)]
}

export function removeEditorStep(
  steps: WorkflowPlanEditorStepDraft[],
  index: number,
): WorkflowPlanEditorStepDraft[] {
  if (steps.length <= 1) return steps
  return steps.filter((_, i) => i !== index)
}

export function toSaveInput(draft: {
  name: string
  steps: WorkflowPlanEditorStepDraft[]
  editingId?: string
}): WorkflowPlanSaveInput {
  const input: WorkflowPlanSaveInput = {
    name: normalizePlanName(draft.name),
    steps: draft.steps.map((step) => ({ nodeId: step.nodeId })),
  }
  if (draft.editingId) input.id = draft.editingId
  return input
}

/** 仅标准获客、高级获客可只读查看。不用 builtin- 前缀，也不认其它 builtin。 */
export function canViewBuiltinWorkflowPlan(
  planId: string | null | undefined,
): boolean {
  return planId === 'builtin-standard' || planId === 'builtin-advanced'
}

/** view 不产生保存入参；create / edit 才会。 */
export function editorModeProducesSaveInput(mode: WorkflowPlanEditorMode): boolean {
  return mode === 'create' || mode === 'edit'
}

/**
 * 按 mode 组装保存入参。view 必须得到 null，不能带上可提交的 name / steps。
 */
export function saveInputForEditorMode(
  mode: WorkflowPlanEditorMode,
  draft: {
    name: string
    steps: WorkflowPlanEditorStepDraft[]
    editingId?: string
  },
): WorkflowPlanSaveInput | null {
  if (!editorModeProducesSaveInput(mode)) return null
  return toSaveInput(draft)
}
