import type { PipelineStep } from '../types/workspace'

const PENDING_STEPS: PipelineStep[] = [
  { id: 'input', label: '1 产品录入', status: 'pending', statusLabel: '待执行' },
  { id: 'keywords', label: '2 关键词扩展', status: 'pending', statusLabel: '待执行' },
  { id: 'explore', label: '3 获客探索', status: 'pending', statusLabel: '待执行' },
  { id: 'score', label: '4 线索评分', status: 'pending', statusLabel: '待执行' },
  { id: 'email', label: '5 邮件草稿', status: 'pending', statusLabel: '待执行' },
]

export interface PipelineDerivationInput {
  profileReady: boolean
  /** 磁盘：keywords expansion 存在 */
  hasKeywords: boolean
  /** 磁盘：至少一条 completed 探索 run */
  hasExploreCompleted: boolean
  /** 磁盘：探索 run 进行中 */
  hasExploreRunning: boolean
  /** 磁盘：scored.json 有已评分线索 */
  scoredCount: number
  /** 磁盘：邮件草稿数 */
  emailDraftCount: number
  generatingProfile: boolean
  expandingKeywords: boolean
  exploring: boolean
  scoring: boolean
  drafting: boolean
}

/** 左侧五步流水线：完成态只看磁盘产物；running 只看当前 Agent 任务。 */
export function derivePipelineSteps(input: PipelineDerivationInput): PipelineStep[] {
  const hasScored = input.scoredCount > 0
  const hasDrafted = input.emailDraftCount > 0
  const canExpandKeywords = input.profileReady
  const canExplore = input.hasKeywords
  const canScore = input.hasExploreCompleted
  const canDraft = hasScored

  return [
    {
      id: 'input',
      label: '1 产品录入',
      status: input.generatingProfile ? 'running' : 'done',
      statusLabel: input.generatingProfile ? '执行中' : '完成',
    },
    {
      id: 'keywords',
      label: '2 关键词扩展',
      status: input.hasKeywords ? 'done' : input.expandingKeywords ? 'running' : 'pending',
      statusLabel: input.hasKeywords
        ? '完成'
        : input.expandingKeywords
          ? '执行中'
          : canExpandKeywords
            ? '可执行'
            : '待就绪',
    },
    {
      id: 'explore',
      label: '3 获客探索',
      status: input.hasExploreCompleted
        ? 'done'
        : input.hasExploreRunning || input.exploring
          ? 'running'
          : 'pending',
      statusLabel: input.hasExploreCompleted
        ? '完成'
        : input.hasExploreRunning || input.exploring
          ? '执行中'
          : canExplore
            ? '可执行'
            : '待关键词',
    },
    {
      id: 'score',
      label: '4 线索评分',
      status: hasScored ? 'done' : input.scoring ? 'running' : 'pending',
      statusLabel: hasScored
        ? '完成'
        : input.scoring
          ? '执行中'
          : canScore
            ? '可执行'
            : '待探索',
    },
    {
      id: 'email',
      label: '5 邮件草稿',
      status: hasDrafted ? 'done' : input.drafting ? 'running' : 'pending',
      statusLabel: hasDrafted
        ? '完成'
        : input.drafting
          ? '执行中'
          : canDraft
            ? '可执行'
            : '待评分',
    },
  ]
}

export function pendingPipelineSteps(): PipelineStep[] {
  return PENDING_STEPS.map((s) => ({ ...s }))
}
