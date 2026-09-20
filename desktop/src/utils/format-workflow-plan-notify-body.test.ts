import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatWorkflowPlanNotifyBody } from './format-workflow-plan-notify-body'

describe('formatWorkflowPlanNotifyBody', () => {
  it('W1 success', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '标准获客',
        ok: true,
        aborted: false,
        completedSteps: 3,
      }),
      '任务方案「标准获客」已完成（3 步）',
    )
  })

  it('W2a abort with zero steps', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '标准获客',
        ok: false,
        aborted: true,
        completedSteps: 0,
      }),
      '任务方案「标准获客」已中止',
    )
  })

  it('W2b abort after partial progress', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '标准获客',
        ok: false,
        aborted: true,
        completedSteps: 2,
      }),
      '任务方案「标准获客」已中止（已完成 2 步）',
    )
  })

  it('W3 failure with step label', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '标准获客',
        ok: false,
        aborted: false,
        completedSteps: 1,
        failedStepLabel: '评分去重',
      }),
      '任务方案「标准获客」失败：评分去重',
    )
  })

  it('W4 failure without step label', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '标准获客',
        ok: false,
        aborted: false,
        completedSteps: 0,
      }),
      '任务方案「标准获客」失败',
    )
  })

  it('empty plan name uses fallback', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: '  ',
        ok: true,
        aborted: false,
        completedSteps: 1,
      }),
      '任务方案「未命名方案」已完成（1 步）',
    )
  })

  it('aborted takes precedence over failed step label', () => {
    assert.equal(
      formatWorkflowPlanNotifyBody({
        planName: 'X',
        ok: false,
        aborted: true,
        completedSteps: 1,
        failedStepLabel: 'R1 广撒网',
      }),
      '任务方案「X」已中止（已完成 1 步）',
    )
  })
})
