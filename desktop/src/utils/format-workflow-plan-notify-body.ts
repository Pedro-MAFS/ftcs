export type WorkflowPlanNotifyInput = {
  planName: string
  ok: boolean
  aborted: boolean
  completedSteps: number
  failedStepLabel?: string
}

function resolvePlanName(planName: string): string {
  const trimmed = planName.trim()
  return trimmed || '未命名方案'
}

/** US-N-03 编排整段结束通知正文（W1～W4） */
export function formatWorkflowPlanNotifyBody(input: WorkflowPlanNotifyInput): string {
  const name = resolvePlanName(input.planName)

  if (input.ok) {
    return `任务方案「${name}」已完成（${input.completedSteps} 步）`
  }

  if (input.aborted) {
    if (input.completedSteps <= 0) {
      return `任务方案「${name}」已中止`
    }
    return `任务方案「${name}」已中止（已完成 ${input.completedSteps} 步）`
  }

  const stepLabel = input.failedStepLabel?.trim()
  if (stepLabel) {
    return `任务方案「${name}」失败：${stepLabel}`
  }
  return `任务方案「${name}」失败`
}
