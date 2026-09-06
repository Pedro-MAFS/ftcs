import type { AgentPreflightKind, WorkflowNodeId } from '../types/electron'

export const WORKFLOW_NODE_LABELS: Record<WorkflowNodeId, string> = {
  'expand-keywords': '扩展关键词',
  'discover-r1': 'R1 广撒网',
  'discover-r2': 'R2 社媒发现',
  'discover-r3': 'R3 地图发现',
  'score-and-dedupe': '评分去重',
  'draft-outreach-email': '批量起草开发信',
}

export const WORKFLOW_NODE_PREFLIGHT: Record<WorkflowNodeId, AgentPreflightKind> = {
  'expand-keywords': 'expand-keywords',
  'discover-r1': 'discover-leads',
  'discover-r2': 'discover-leads-r2',
  'discover-r3': 'discover-leads-r3',
  'score-and-dedupe': 'score-and-dedupe',
  'draft-outreach-email': 'draft-email',
}

export function workflowNodeLabel(nodeId: WorkflowNodeId): string {
  return WORKFLOW_NODE_LABELS[nodeId] ?? nodeId
}
