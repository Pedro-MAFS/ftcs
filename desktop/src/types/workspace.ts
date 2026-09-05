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

export type ProductStatusTone = 'success' | 'accent' | 'warning' | 'muted'

export interface ProductSummary {
  id: string
  /** 顶栏 / 兼容旧用法：优先公司名 */
  name: string
  companyName: string
  /** 侧栏副标题（已截断，如「A · B · C · +4」） */
  productsLabel: string
  /** 悬停完整产品列表 */
  productsTooltip: string
  status: string
  statusLabel: string
  statusTone: ProductStatusTone
  updatedLabel: string
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

export interface AgentTimelineItem {
  id: string
  kind: 'user' | 'system' | 'assistant' | 'reasoning' | 'tool' | 'error'
  time: string
  title: string
  body: string
  status?: 'running' | 'done' | 'error'
  collapsed?: boolean
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
    subtitle: '确认画像后可新建探索任务，自动扩展关键词',
  },
  explore: {
    label: '探索',
    title: '获客探索',
    subtitle: '探索任务由画像驱动，扩展关键词后即可启用 R1',
  },
  leads: {
    label: '线索',
    title: '线索库',
    subtitle: '原始与已评分线索 · 可按状态筛选',
  },
  email: {
    label: '邮件',
    title: '邮件审核',
    subtitle: '审阅开发信草稿，通过后保存待发送',
  },
  settings: {
    label: '设置',
    title: '设置',
    subtitle: '模型通道 · 搜索 API · 工作区 · OpenCode',
  },
}

export const PIPELINE_TO_SECTION: Partial<Record<PipelineStepId, WorkspaceSection>> = {
  input: 'input',
  keywords: 'profile',
  explore: 'explore',
  score: 'leads',
  /** 起草入口在线索页；审阅草稿走顶栏「邮件」 */
  email: 'leads',
}
