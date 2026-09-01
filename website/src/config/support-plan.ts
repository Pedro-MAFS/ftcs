export type SupportPlanPriority = 'P0' | 'P1' | 'P2'
export type SupportPlanStatus = 'developing' | 'planned'

export interface SupportPlanItem {
  id: string
  title: string
  description: string
  priority: SupportPlanPriority
  status: SupportPlanStatus
}

export const supportPlanStatusLabels: Record<SupportPlanStatus, string> = {
  developing: '开发中',
  planned: '规划中',
}

export const supportPlanPriorityLabels: Record<SupportPlanPriority, string> = {
  P0: 'P0 · 当前最高优先',
  P1: 'P1 · 次优先',
  P2: 'P2 · 排期靠后',
}

/** 按状态、优先级排序：开发中在前，同状态内 P0 → P2 */
export const supportPlanItems: SupportPlanItem[] = [
  {
    id: 'r3-map-discovery',
    title: 'R3 地图发现',
    description:
      '按地区通过 Places API 发现潜在采购商，无官网时补搜后再打开官网判断；通过后写入线索。不打开地图真页。',
    priority: 'P0',
    status: 'developing',
  },
  {
    id: 'people-contact-profile',
    title: '人员联系画像',
    description:
      '在已有公司线索上，按买家角色补全关键联系人（姓名、职位、来源与匹配理由），供开发信选用收件人。默认人工触发。',
    priority: 'P0',
    status: 'planned',
  },
  {
    id: 'r4-directory',
    title: 'R4 黄页名录探索',
    description: '按行业黄页 / 名录站点发现公司并核对官网。评审通过后再拆用户故事与详设。',
    priority: 'P2',
    status: 'planned',
  },
  {
    id: 'workflow-orchestration',
    title: '任务编排 · 一键跑通',
    description:
      '将任意流程节点（如 R1 探索、R2 探索、评分去重等）组合为一个按钮顺序执行。提交后在后台运行，完成后通知用户，无需逐步盯屏等待。',
    priority: 'P0',
    status: 'planned',
  },
  {
    id: 'runtime-setup-simplify',
    title: '简化运行环境安装',
    description:
      '减少 Node、OpenCode、Chrome 等前置依赖的手动配置步骤，尽量一键或向导式完成，降低首次启动失败率。',
    priority: 'P0',
    status: 'planned',
  },
  {
    id: 'onboarding-guide',
    title: '业务流程引导',
    description:
      '按录入 → 画像 → 探索 → 线索 → 开发信的主线，提供更清晰的新手引导与空态提示，减少不知道下一步该做什么的困惑。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'input-images-pdf',
    title: '产品录入 · 图片与 PDF',
    description:
      '资料工程树除现有官网、文本与 Office 外，支持直接纳入图片与 PDF 文件参与画像生成（具体格式与抽取方式待详设）。',
    priority: 'P0',
    status: 'planned',
  },
  {
    id: 'ui-button-states',
    title: '业务界面 · 按钮可用状态',
    description:
      '各业务按钮明确何时可点、何时置灰，并在不可用时给出简短原因（如「需先完成画像」「探索进行中」），减少误点与试错。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'email-to-lead-navigation',
    title: '开发信 · 跳回对应线索',
    description:
      '在开发信界面可一键跳转回线索页，并自动选中该草稿关联的线索，便于对照公司信息与联系人后再改稿。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'email-draft-styles',
    title: '开发信 · 多风格与中英对照',
    description:
      '起草开发信时可选多种行文风格（如正式、简洁、友好等），并支持中英文对照展示，便于审阅与修改后再发出。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'similar-leads-explore',
    title: '相似线索探索',
    description:
      '基于已有高价值线索的特征（行业、地区、产品匹配等），自动扩展搜索并发现类似潜在采购商。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'competitor-explore',
    title: '竞品导向探索',
    description:
      '根据竞品或对标企业的公开信息，反查其客户 / 采购商线索，辅助找到同类买家。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'scheduled-tasks',
    title: '定时运行编排任务',
    description:
      '对已保存的任务编排方案支持按计划定时触发（如每周复搜），后台执行并在完成或异常时通知用户。依赖任务编排能力。',
    priority: 'P2',
    status: 'planned',
  },
  {
    id: 'in-app-email-send',
    title: '系统内发送开发信',
    description:
      '在应用内对接邮件发送能力，审阅草稿后可直接发出，无需复制到外部邮箱客户端（账户配置与合规待详设）。',
    priority: 'P2',
    status: 'planned',
  },
]

const priorityRank: Record<SupportPlanPriority, number> = { P0: 0, P1: 1, P2: 2 }
const statusRank: Record<SupportPlanStatus, number> = { developing: 0, planned: 1 }

export function compareSupportPlanItems(a: SupportPlanItem, b: SupportPlanItem): number {
  const byStatus = statusRank[a.status] - statusRank[b.status]
  if (byStatus !== 0) return byStatus
  return priorityRank[a.priority] - priorityRank[b.priority]
}

export type SupportPlanFilters = {
  priority: SupportPlanPriority | 'all'
  status: SupportPlanStatus | 'all'
  keyword: string
}

export function filterSupportPlanItems(
  items: SupportPlanItem[],
  filters: SupportPlanFilters,
): SupportPlanItem[] {
  const keyword = filters.keyword.trim().toLowerCase()
  return items
    .filter((item) => {
      if (filters.priority !== 'all' && item.priority !== filters.priority) return false
      if (filters.status !== 'all' && item.status !== filters.status) return false
      if (!keyword) return true
      const haystack = `${item.title} ${item.description}`.toLowerCase()
      return haystack.includes(keyword)
    })
    .slice()
    .sort(compareSupportPlanItems)
}

export function groupSupportPlanByStatus(
  items: SupportPlanItem[],
): { status: SupportPlanStatus; items: SupportPlanItem[] }[] {
  const groups: SupportPlanStatus[] = ['developing', 'planned']
  return groups
    .map((status) => ({
      status,
      items: items.filter((item) => item.status === status),
    }))
    .filter((group) => group.items.length > 0)
}
