import { IPC } from '../ipc/types'
import type { AgentPreflightKind } from '../ipc/types'
import type { WorkflowNodeId } from './workflow-plans-types'

export type WorkflowExecuteVia =
  | 'expandKeywords'
  | 'startExploreR1'
  | 'startExploreR2'
  | 'startExploreR3'
  | 'scoreAndDedupeLeads'
  | 'enrichLeadContacts'
  | 'draftEmails'

export interface WorkflowNodeDef {
  id: WorkflowNodeId
  label: string
  skill: string
  preflightSkill: AgentPreflightKind
  executeVia: WorkflowExecuteVia
  ipcChannel: keyof typeof IPC
}

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodeDef[] = [
  {
    id: 'expand-keywords',
    label: '扩展关键词',
    skill: 'expand-keywords',
    preflightSkill: 'expand-keywords',
    executeVia: 'expandKeywords',
    ipcChannel: 'KEYWORDS_EXPAND',
  },
  {
    id: 'discover-r1',
    label: 'R1 广撒网',
    skill: 'discover-leads',
    preflightSkill: 'discover-leads',
    executeVia: 'startExploreR1',
    ipcChannel: 'EXPLORATION_START_R1',
  },
  {
    id: 'discover-r2',
    label: 'R2 社媒发现',
    skill: 'discover-leads-r2',
    preflightSkill: 'discover-leads-r2',
    executeVia: 'startExploreR2',
    ipcChannel: 'EXPLORATION_START_R2',
  },
  {
    id: 'discover-r3',
    label: 'R3 地图发现',
    skill: 'discover-leads-r3',
    preflightSkill: 'discover-leads-r3',
    executeVia: 'startExploreR3',
    ipcChannel: 'EXPLORATION_START_R3',
  },
  {
    id: 'score-and-dedupe',
    label: '评分去重',
    skill: 'score-and-dedupe',
    preflightSkill: 'score-and-dedupe',
    executeVia: 'scoreAndDedupeLeads',
    ipcChannel: 'LEADS_SCORE_AND_DEDUPE',
  },
  {
    id: 'enrich-lead-contacts',
    label: '批量补全联系人',
    skill: 'enrich-lead-contacts',
    preflightSkill: 'enrich-lead-contacts',
    executeVia: 'enrichLeadContacts',
    ipcChannel: 'LEADS_ENRICH_CONTACTS',
  },
  {
    id: 'draft-outreach-email',
    label: '批量起草开发信',
    skill: 'draft-outreach-email',
    preflightSkill: 'draft-email',
    executeVia: 'draftEmails',
    ipcChannel: 'EMAIL_DRAFT_GENERATE',
  },
] as const

const NODE_BY_ID = new Map(WORKFLOW_NODE_CATALOG.map((node) => [node.id, node]))

export function isWorkflowNodeId(value: string): value is WorkflowNodeId {
  return NODE_BY_ID.has(value as WorkflowNodeId)
}

export function getWorkflowNodeDef(nodeId: WorkflowNodeId): WorkflowNodeDef {
  const def = NODE_BY_ID.get(nodeId)
  if (!def) {
    throw new Error(`未知步骤：${nodeId}`)
  }
  return def
}

export function listWorkflowNodeDefs(): readonly WorkflowNodeDef[] {
  return WORKFLOW_NODE_CATALOG
}
