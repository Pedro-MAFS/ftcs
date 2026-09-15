import { ref, type Ref } from 'vue'
import {
  WORKFLOW_NODE_LABELS,
  WORKFLOW_NODE_PREFLIGHT,
  workflowNodeLabel,
} from '../constants/workflow-node-labels'
import type { WorkflowNodeId, WorkflowPlan } from '../types/electron'
import { ensureAgentReady } from './useAgentPreflight'
import { useExploreStart } from './useExploreStart'
import { useWorkspace } from './useWorkspace'
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
  executePlan: (planId: string) => Promise<WorkflowExecuteResult>
  cancel: () => Promise<void>
} {
  const running = ref(false)
  const currentStepIndex = ref(-1)
  const currentStepLabel = ref('')
  const currentPlanName = ref('')
  let abortController: AbortController | null = null

  const {
    activeProductId,
    currentProfile,
    leadsSnapshot,
    emailDraftsSnapshot,
    generating,
    agentStatus,
    resetAgentForExpandKeywords,
    resetAgentForScoreAndDedupe,
    resetAgentForDraftEmail,
    refreshPipelineArtifacts,
  } = useWorkspace()

  const explore = useExploreStart()

  function assertStepReady(nodeId: WorkflowNodeId): string | null {
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
      default:
        return `未知步骤：${nodeId}`
    }
  }

  async function launchStep(
    nodeId: WorkflowNodeId,
    productId: string,
    signal: AbortSignal,
  ): Promise<{ ipcOk: boolean; message: string }> {
    switch (nodeId) {
      case 'expand-keywords': {
        if (!window.ftcs?.expandKeywords) {
          return { ipcOk: false, message: '扩展关键词接口不可用' }
        }
        resetAgentForExpandKeywords()
        const donePromise = waitForAgentDone(productId, { signal })
        try {
          const res = await window.ftcs.expandKeywords(productId)
          if (!res.ok) {
            agentStatus.value = 'error'
            return { ipcOk: false, message: res.message }
          }
          const done = await donePromise
          return { ipcOk: done.ok, message: done.message }
        } catch (err) {
          if (isAbortError(err)) throw err
          agentStatus.value = 'error'
          return {
            ipcOk: false,
            message: err instanceof Error ? err.message : String(err),
          }
        }
      }
      case 'discover-r1': {
        const res = await explore.startR1()
        if (!res.ok) return { ipcOk: false, message: res.message }
        const done = await waitForAgentDone(productId, { signal })
        return { ipcOk: done.ok, message: done.message }
      }
      case 'discover-r2': {
        const res = await explore.startR2()
        if (!res.ok) return { ipcOk: false, message: res.message }
        const done = await waitForAgentDone(productId, { signal })
        return { ipcOk: done.ok, message: done.message }
      }
      case 'discover-r3': {
        const res = await explore.startR3()
        if (!res.ok) return { ipcOk: false, message: res.message }
        const done = await waitForAgentDone(productId, { signal })
        return { ipcOk: done.ok, message: done.message }
      }
      case 'score-and-dedupe': {
        if (!window.ftcs?.scoreAndDedupeLeads) {
          return { ipcOk: false, message: '评分去重接口不可用' }
        }
        const raw = leadsSnapshot.value?.stats.raw ?? 0
        resetAgentForScoreAndDedupe(raw)
        const donePromise = waitForAgentDone(productId, { signal })
        try {
          const res = await window.ftcs.scoreAndDedupeLeads(productId)
          if (!res.ok) {
            agentStatus.value = 'error'
            return { ipcOk: false, message: res.message }
          }
          const done = await donePromise
          return { ipcOk: done.ok, message: done.message }
        } catch (err) {
          if (isAbortError(err)) throw err
          agentStatus.value = 'error'
          return {
            ipcOk: false,
            message: err instanceof Error ? err.message : String(err),
          }
        }
      }
      case 'draft-outreach-email': {
        if (!window.ftcs?.draftEmails) {
          return { ipcOk: false, message: '批量起草接口不可用' }
        }
        const pending = emailDraftsSnapshot.value?.pendingHighLeadIds.length ?? 0
        resetAgentForDraftEmail(pending)
        const donePromise = waitForAgentDone(productId, { signal })
        try {
          const res = await window.ftcs.draftEmails({ productId })
          if (!res.ok) {
            agentStatus.value = 'error'
            return { ipcOk: false, message: res.message }
          }
          const done = await donePromise
          return { ipcOk: done.ok, message: done.message }
        } catch (err) {
          if (isAbortError(err)) throw err
          agentStatus.value = 'error'
          return {
            ipcOk: false,
            message: err instanceof Error ? err.message : String(err),
          }
        }
      }
      default:
        return { ipcOk: false, message: `未知步骤：${nodeId}` }
    }
  }

  async function executePlan(planId: string): Promise<WorkflowExecuteResult> {
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
    abortController = new AbortController()
    let completed = 0
    let failedStep: WorkflowNodeId | undefined

    try {
      for (let i = 0; i < plan.steps.length; i += 1) {
        const step = plan.steps[i]
        currentStepIndex.value = i
        currentStepLabel.value = workflowNodeLabel(step.nodeId)

        const gate = assertStepReady(step.nodeId)
        if (gate) {
          failedStep = step.nodeId
          throw new Error(gate)
        }

        const launch = await launchStep(step.nodeId, productId, abortController.signal)
        await refreshPipelineArtifacts()
        await options?.refreshLeads?.()

        if (!launch.ipcOk) {
          failedStep = step.nodeId
          throw new Error(launch.message || '步骤启动失败')
        }

        completed += 1
      }

      const msg = `方案「${plan.name}」已完成（${completed} 步）`
      options?.onMessage?.(msg)
      return { ok: true, message: msg, completedSteps: completed }
    } catch (err) {
      if (isAbortError(err)) {
        const msg = '已中止'
        options?.onMessage?.(msg)
        return { ok: false, message: msg, completedSteps: completed }
      }

      const detail = err instanceof Error ? err.message : String(err)
      const label =
        failedStep != null
          ? WORKFLOW_NODE_LABELS[failedStep]
          : currentStepLabel.value || '未知步骤'
      const msg = formatWorkflowFail(plan.name, label, detail)
      options?.onMessage?.(msg)
      return {
        ok: false,
        message: msg,
        failedStep:
          failedStep != null
            ? { nodeId: failedStep, label: WORKFLOW_NODE_LABELS[failedStep] }
            : undefined,
        completedSteps: completed,
      }
    } finally {
      running.value = false
      currentStepIndex.value = -1
      currentStepLabel.value = ''
      currentPlanName.value = ''
      abortController = null
    }
  }

  async function cancel(): Promise<void> {
    abortController?.abort()
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
