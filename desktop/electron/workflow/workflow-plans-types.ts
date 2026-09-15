export type WorkflowNodeId =
  | 'expand-keywords'
  | 'discover-r1'
  | 'discover-r2'
  | 'discover-r3'
  | 'score-and-dedupe'
  | 'enrich-lead-contacts'
  | 'draft-outreach-email'

export interface WorkflowPlanStep {
  nodeId: WorkflowNodeId
}

export interface WorkflowPlan {
  id: string
  name: string
  steps: WorkflowPlanStep[]
  builtin?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface WorkflowPlanSaveInput {
  id?: string
  name: string
  steps: WorkflowPlanStep[]
}

export interface WorkflowListPlansResult {
  ok: boolean
  plans: WorkflowPlan[]
  message?: string
}

export interface WorkflowSavePlanResult {
  ok: boolean
  plan?: WorkflowPlan
  message?: string
}

export interface WorkflowDeletePlanResult {
  ok: boolean
  message?: string
}
