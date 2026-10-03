import { ref, type Ref } from 'vue'
import {
  WORKFLOW_NODE_LABELS,
  WORKFLOW_NODE_PREFLIGHT,
  workflowNodeLabel,
} from '../constants/workflow-node-labels'
import type { LeadRowDto, WorkflowNodeId, WorkflowPlan } from '../types/electron'
import { parseCompanyDomain } from '../utils/parse-company-domain'
import { ensureAgentReady } from './useAgentPreflight'
import { useExploreStart } from './useExploreStart'
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

function countPendingEnrich(rows: LeadRowDto[] | undefined): number {
  if (!rows?.length) return 0
  return rows.filter(
    (row) =>
      row.phase === 'scored' &&
      Boolean(parseCompanyDomain(row.company?.website || row.domain)) &&
      (!row.people || row.people.length === 0),
  ).length
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
  executePlan: (planId: string) => Promise<WorkflowExecuteResult>
  cancel: () => Promise<void>
} {
  const running = workflowRunning
  const currentStepIndex = workflowCurrentStepIndex
  const currentStepLabel = workflowCurrentStepLabel
  const currentPlanName = workflowCurrentPlanName

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
    resetAgentForEnrichContacts,
    refreshPipelineArtifacts,
  } = useWorkspace()

  const explore = useExploreStart()

  function assertStepReady(nodeId: WorkflowNodeId): string | null {
    if (!activeProductId.value) return '请先在侧栏选择产品'
    if (generating.value) return '已有任务在运行'
    return null
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
      case 'enrich-lead-contacts': {
        if (!window.ftcs?.enrichLeadContacts) {
          return { ipcOk: false, message: '批量补全接口不可用' }
        }
        const pendingIds = (leadsSnapshot.value?.rows ?? [])
          .filter(
            (row) =>
              row.phase === 'scored' &&
              Boolean(parseCompanyDomain(row.company?.website || row.domain)) &&
              (!row.people || row.people.length === 0),
          )
          .map((row) => row.id)
        const settings = window.ftcs.getSettings
          ? await window.ftcs.getSettings()
          : null
        const verifyEmails = settings?.hunterVerifyEmails !== false
        resetAgentForEnrichContacts(pendingIds, verifyEmails)
        const donePromise = waitForAgentDone(productId, { signal })
        try {
          const res = await window.ftcs.enrichLeadContacts({ productId })
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

        const gate = assertStepReady(step.nodeId)
        if (gate) {
          failedStep = step.nodeId
          throw new Error(gate)
        }

        const launch = await launchStep(
          step.nodeId,
          productId,
          workflowAbortController.signal,
        )
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
