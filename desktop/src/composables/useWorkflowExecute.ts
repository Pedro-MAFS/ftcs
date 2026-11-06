import { ref, type Ref } from 'vue'
import {
  WORKFLOW_NODE_LABELS,
  WORKFLOW_NODE_PREFLIGHT,
  workflowNodeLabel,
} from '../constants/workflow-node-labels'
import type { WorkflowNodeId, WorkflowPlan } from '../types/electron'
import { ensureAgentReady } from './useAgentPreflight'
import { useWorkspace } from './useWorkspace'
import { formatWorkflowPlanNotifyBody } from '../utils/format-workflow-plan-notify-body'
import { waitForAgentDone } from './wait-for-agent-done'

export type WorkflowExecuteResult =
  | { ok: true; message: string; completedSteps: number }
  | {
      ok: false
      message: string
      failedStep?: { nodeId: WorkflowNodeId; label: string }
      completedSteps: number
    }

export function formatWorkflowFail(
  planName: string,
  stepLabel: string,
  detail: string,
): string {
  return `方案「${planName}」在步骤「${stepLabel}」失败：${detail}`
}

export async function runWorkflowPreflight(plan: WorkflowPlan): Promise<string | null> {
  const seen = new Set<string>()
  for (const step of plan.steps) {
    const kind = WORKFLOW_NODE_PREFLIGHT[step.nodeId]
    if (seen.has(kind)) continue
    seen.add(kind)
    const err = await ensureAgentReady(kind)
    if (err) return err
  }
  return null
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** 模块级共享，避免线索页与定时触发器各持一份 running */
const workflowRunning = ref(false)
const workflowCurrentStepIndex = ref(-1)
const workflowCurrentStepLabel = ref('')
const workflowCurrentPlanName = ref('')
let workflowAbortController: AbortController | null = null

type WorkflowNotifyFtcs = {
  setWorkflowNotifySuppressed?: (suppressed: boolean) => Promise<void> | void
  showTaskDoneNotification?: (input: {
    ok: boolean
    body: string
  }) => Promise<boolean> | boolean
}

/** US-N-03：编排结束解除抑制并弹一次系统通知（供单测） */
export async function notifyWorkflowPlanFinished(
  ftcs: WorkflowNotifyFtcs | undefined,
  input: {
    suppressArmed: boolean
    outcome: WorkflowExecuteResult | null
    planNameForNotify: string
  },
): Promise<void> {
  if (!input.suppressArmed) return
  try {
    await ftcs?.setWorkflowNotifySuppressed?.(false)
    if (!input.outcome) return
    const aborted =
      !input.outcome.ok && input.outcome.message === '已中止'
    const body = formatWorkflowPlanNotifyBody({
      planName: input.planNameForNotify,
      ok: input.outcome.ok,
      aborted,
      completedSteps: input.outcome.completedSteps,
      failedStepLabel:
        input.outcome.ok || aborted ? undefined : input.outcome.failedStep?.label,
    })
    await ftcs?.showTaskDoneNotification?.({
      ok: input.outcome.ok,
      body,
    })
  } catch {
    // 静默
  }
}

async function loadWorkflowPlan(planId: string): Promise<WorkflowPlan | null> {
  if (!window.ftcs?.listWorkflowPlans) return null
  const res = await window.ftcs.listWorkflowPlans()
  if (!res.ok) return null
  return res.plans.find((plan) => plan.id === planId) ?? null
}

export function useWorkflowExecute(options?: {
  onMessage?: (message: string) => void
  refreshLeads?: () => Promise<void>
}): {
  running: Ref<boolean>
  currentStepIndex: Ref<number>
  currentStepLabel: Ref<string>
  currentPlanName: Ref<string>
  runWorkflowPreflight: (plan: WorkflowPlan) => Promise<string | null>
  executePlan: (planId: string, origin?: 'workflow' | 'schedule') => Promise<WorkflowExecuteResult>
  cancel: () => Promise<void>
} {
  const running = workflowRunning
  const currentStepIndex = workflowCurrentStepIndex
  const currentStepLabel = workflowCurrentStepLabel
  const currentPlanName = workflowCurrentPlanName

  const { activeProductId } = useWorkspace()

  async function executePlan(planId: string, origin: 'workflow' | 'schedule' = 'workflow'): Promise<WorkflowExecuteResult> {
    if (running.value) {
      return { ok: false, message: '已有方案在执行中', completedSteps: 0 }
    }

    const plan = await loadWorkflowPlan(planId)
    if (!plan) {
      return { ok: false, message: `方案不存在：${planId}`, completedSteps: 0 }
    }

    const productId = activeProductId.value
    if (!productId) {
      return { ok: false, message: '请先在侧栏选择产品', completedSteps: 0 }
    }

    const preflightErr = await runWorkflowPreflight(plan)
    if (preflightErr) {
      return { ok: false, message: preflightErr, completedSteps: 0 }
    }

    running.value = true
    currentPlanName.value = plan.name
    const planNameForNotify = plan.name
    workflowAbortController = new AbortController()
    let completed = 0
    let failedStep: WorkflowNodeId | undefined
    let outcome: WorkflowExecuteResult | null = null
    let suppressArmed = false

    try {
      try {
        await window.ftcs?.setWorkflowNotifySuppressed?.(true)
        suppressArmed = true
      } catch {
        console.warn('[ftcs:notify] setWorkflowNotifySuppressed(true) failed')
      }

      for (let i = 0; i < plan.steps.length; i += 1) {
        const step = plan.steps[i]
        currentStepIndex.value = i
        currentStepLabel.value = workflowNodeLabel(step.nodeId)

        failedStep = step.nodeId
        workflowAbortController.signal.throwIfAborted()
        if (!window.ftcs?.launchWorkflowStep) throw new Error('桌面任务通道未连接')
        const taskId = await window.ftcs.launchWorkflowStep(step.nodeId, productId, origin)
        const result = await waitForAgentDone(taskId, { signal: workflowAbortController.signal })
        if (!result.ok) throw new Error(result.message)
        failedStep = undefined
        completed += 1
      }

      const msg = `方案「${plan.name}」已完成（${completed} 步）`
      options?.onMessage?.(msg)
      outcome = { ok: true, message: msg, completedSteps: completed }
      return outcome
    } catch (err) {
      if (isAbortError(err)) {
        const msg = '已中止'
        options?.onMessage?.(msg)
        outcome = { ok: false, message: msg, completedSteps: completed }
        return outcome
      }

      const detail = err instanceof Error ? err.message : String(err)
      const label =
        failedStep != null
          ? WORKFLOW_NODE_LABELS[failedStep]
          : currentStepLabel.value || '未知步骤'
      const msg = formatWorkflowFail(plan.name, label, detail)
      options?.onMessage?.(msg)
      outcome = {
        ok: false,
        message: msg,
        failedStep:
          failedStep != null
            ? { nodeId: failedStep, label: WORKFLOW_NODE_LABELS[failedStep] }
            : undefined,
        completedSteps: completed,
      }
      return outcome
    } finally {
      running.value = false
      currentStepIndex.value = -1
      currentStepLabel.value = ''
      currentPlanName.value = ''
      workflowAbortController = null
      await notifyWorkflowPlanFinished(window.ftcs, {
        suppressArmed,
        outcome,
        planNameForNotify,
      })
    }
  }

  async function cancel(): Promise<void> {
    workflowAbortController?.abort()
    await window.ftcs?.abortProfile?.()
  }

  return {
    running,
    currentStepIndex,
    currentStepLabel,
    currentPlanName,
    runWorkflowPreflight,
    executePlan,
    cancel,
  }
}
