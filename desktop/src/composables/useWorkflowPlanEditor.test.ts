import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WorkflowPlan } from '../types/electron'
import {
  addEditorStep,
  canViewBuiltinWorkflowPlan,
  createDefaultEditorDraft,
  createEditorStep,
  editorModeProducesSaveInput,
  moveEditorStep,
  removeEditorStep,
  saveInputForEditorMode,
  toSaveInput,
  validateWorkflowPlanDraft,
  WORKFLOW_PLAN_MAX_STEPS,
} from './useWorkflowPlanEditor'

describe('useWorkflowPlanEditor', () => {
  it('T1 validateWorkflowPlanDraft rejects empty name', () => {
    assert.equal(
      validateWorkflowPlanDraft({
        name: '   ',
        steps: [createEditorStep()],
      }),
      '请输入方案名称',
    )
  })

  it('T2 validateWorkflowPlanDraft rejects duplicate name', () => {
    const existingPlans: WorkflowPlan[] = [
      {
        id: 'user_aaa',
        name: '我的方案',
        steps: [{ nodeId: 'discover-r1' }],
      },
    ]
    assert.equal(
      validateWorkflowPlanDraft({
        name: '我的方案',
        steps: [createEditorStep()],
        existingPlans,
      }),
      '已存在同名方案「我的方案」',
    )
    assert.equal(
      validateWorkflowPlanDraft({
        name: '我的方案',
        steps: [createEditorStep()],
        existingPlans,
        editingId: 'user_aaa',
      }),
      null,
    )
  })

  it('T3 validateWorkflowPlanDraft rejects invalid step count', () => {
    assert.equal(
      validateWorkflowPlanDraft({
        name: '测试',
        steps: [],
      }),
      '方案须包含 1～10 个步骤',
    )

    const tooMany = Array.from({ length: WORKFLOW_PLAN_MAX_STEPS + 1 }, () =>
      createEditorStep(),
    )
    assert.equal(
      validateWorkflowPlanDraft({
        name: '测试',
        steps: tooMany,
      }),
      '方案须包含 1～10 个步骤',
    )
  })

  it('T4 moveEditorStep respects boundaries', () => {
    const steps = [createEditorStep('discover-r1'), createEditorStep('discover-r2')]
    assert.deepEqual(moveEditorStep(steps, 0, 'up'), steps)
    assert.deepEqual(moveEditorStep(steps, 1, 'down'), steps)
    const moved = moveEditorStep(steps, 1, 'up')
    assert.equal(moved[0].nodeId, 'discover-r2')
    assert.equal(moved[1].nodeId, 'discover-r1')
  })

  it('T5 toSaveInput includes id only when editing', () => {
    const draft = {
      name: '  仅 R1  ',
      steps: [createEditorStep('discover-r1')],
    }
    assert.deepEqual(toSaveInput(draft), {
      name: '仅 R1',
      steps: [{ nodeId: 'discover-r1' }],
    })
    assert.deepEqual(toSaveInput({ ...draft, editingId: 'user_abcd1234' }), {
      id: 'user_abcd1234',
      name: '仅 R1',
      steps: [{ nodeId: 'discover-r1' }],
    })
  })

  it('canViewBuiltinWorkflowPlan is true only for the two builtin plan ids', () => {
    assert.equal(canViewBuiltinWorkflowPlan('builtin-standard'), true)
    assert.equal(canViewBuiltinWorkflowPlan('builtin-advanced'), true)
    assert.equal(canViewBuiltinWorkflowPlan('user_aaa'), false)
    assert.equal(canViewBuiltinWorkflowPlan(''), false)
    assert.equal(canViewBuiltinWorkflowPlan(null), false)
    assert.equal(canViewBuiltinWorkflowPlan(undefined), false)
    assert.equal(canViewBuiltinWorkflowPlan('builtin-custom'), false)
    assert.equal(canViewBuiltinWorkflowPlan('builtin-'), false)
  })

  it('editorModeProducesSaveInput is false only for view', () => {
    assert.equal(editorModeProducesSaveInput('view'), false)
    assert.equal(editorModeProducesSaveInput('create'), true)
    assert.equal(editorModeProducesSaveInput('edit'), true)
  })

  it('saveInputForEditorMode returns null for view', () => {
    const draft = {
      name: '标准获客',
      steps: [createEditorStep('discover-r1'), createEditorStep('discover-r2')],
      editingId: 'builtin-standard',
    }
    const viewed = saveInputForEditorMode('view', draft)
    assert.equal(viewed, null)

    const created = saveInputForEditorMode('create', {
      name: draft.name,
      steps: draft.steps,
    })
    assert.ok(created)
    assert.equal(created.name, '标准获客')
    assert.deepEqual(created.steps, [
      { nodeId: 'discover-r1' },
      { nodeId: 'discover-r2' },
    ])

    const edited = saveInputForEditorMode('edit', draft)
    assert.ok(edited)
    assert.equal(edited.id, 'builtin-standard')
    assert.equal(edited.name, '标准获客')
  })

  it('addEditorStep and removeEditorStep enforce limits', () => {
    let steps = createDefaultEditorDraft().steps
    steps = addEditorStep(steps, 'discover-r2')
    assert.equal(steps.length, 2)
    assert.equal(removeEditorStep(steps, 0).length, 1)
    assert.equal(removeEditorStep(steps, 0).length, 1)
    for (let i = 0; i < WORKFLOW_PLAN_MAX_STEPS; i += 1) {
      steps = addEditorStep(steps)
    }
    assert.equal(steps.length, WORKFLOW_PLAN_MAX_STEPS)
    assert.equal(addEditorStep(steps).length, WORKFLOW_PLAN_MAX_STEPS)
  })
})
