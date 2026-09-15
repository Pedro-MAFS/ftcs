import type { WorkflowPlan } from './workflow-plans-types'

export const BUILTIN_WORKFLOW_PLANS: readonly WorkflowPlan[] = [
  {
    id: 'builtin-standard',
    name: '标准获客',
    builtin: true,
    steps: [
      { nodeId: 'discover-r1' },
      { nodeId: 'discover-r2' },
      { nodeId: 'score-and-dedupe' },
      { nodeId: 'draft-outreach-email' },
    ],
  },
  {
    id: 'builtin-advanced',
    name: '高级获客',
    builtin: true,
    steps: [
      { nodeId: 'discover-r1' },
      { nodeId: 'discover-r2' },
      { nodeId: 'discover-r3' },
      { nodeId: 'score-and-dedupe' },
      { nodeId: 'enrich-lead-contacts' },
      { nodeId: 'draft-outreach-email' },
    ],
  },
] as const

export const DEFAULT_WORKFLOW_PLAN_ID = 'builtin-standard' as const
