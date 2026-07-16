export type WorkspaceSection =
  | 'input'
  | 'profile'
  | 'explore'
  | 'leads'
  | 'email'
  | 'settings'

export type PipelineStepId =
  | 'input'
  | 'keywords'
  | 'explore'
  | 'score'
  | 'email'

export type PipelineStepStatus = 'done' | 'running' | 'pending'

export interface ProductSummary {
  id: string
  name: string
  meta: string
}

export interface PipelineStep {
  id: PipelineStepId
  label: string
  status: PipelineStepStatus
  statusLabel: string
}

export interface AgentLogLine {
  time: string
  tag: string
  message: string
}

export interface AgentMetaItem {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'accent'
}

export const SECTION_META: Record<
  WorkspaceSection,
  { label: string; title: string; subtitle: string }
> = {
  input: {
    label: '录入',
    title: '产品录入',
    subtitle: '维护公司网站与产品资料，再从资料库生成画像',
  },
  profile: {
    label: '画像',
    title: '产品画像',
    subtitle: '查看与编辑画像字段，确认就绪度后扩展关键词',
  },
  explore: {
    label: '探索',
    title: '获客探索',
    subtitle: '一键执行 R1 广撒网，查看进度与候选线索',
  },
  leads: {
    label: '线索',
    title: '线索库',
    subtitle: '去重评分后的线索 · 按 Tier 筛选',
  },
  email: {
    label: '邮件',
    title: '邮件审核',
    subtitle: '审阅开发信草稿，通过后保存待发送',
  },
  settings: {
    label: '设置',
    title: '设置',
    subtitle: '模型 · 提供商 · 搜索 API · 工作区 · OpenCode',
  },
}

export const PIPELINE_TO_SECTION: Partial<Record<PipelineStepId, WorkspaceSection>> = {
  input: 'input',
  keywords: 'profile',
  explore: 'explore',
  score: 'leads',
  email: 'email',
}
