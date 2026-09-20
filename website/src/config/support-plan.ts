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
    id: 'task-done-notification',
    title: '任务完成 · Windows 通知',
    description:
      'Agent 长任务（探索、评分、开发信起草等）完成后，若窗口未聚焦则弹出 Windows 系统通知；编排一键跑通仅整段结束通知一次。需求见仓库 docs/22-需求-任务完成Windows通知.md。',
    priority: 'P0',
    status: 'developing',
  },
  {
    id: 'desktop-silent-update',
    title: '桌面端 · 后台检测与下载更新',
    description:
      '当前新版本需用户自行打开官网下载安装包并重新安装；应用内「检查更新」仅提示版本并跳转下载页。用户反馈希望自动监测新版本、在后台下载安装包，下载完成后提醒用户安装或重启以完成更新，减少手工升级步骤。',
    priority: 'P1',
    status: 'planned',
  },
  {
    id: 'lead-company-intelligence',
    title: '线索 · 目标公司深度画像',
    description:
      '在线索页为每条公司线索生成结构化「企业画像」：商业模式与体量、主营产品与品牌、目标市场与客户、供应链与采购倾向、行业地位与优势、合作机会与跟进建议，并附可改稿的破冰话术。用户反馈：拿到线索后仍要自行调研才能判断值不值得跟；希望打开线索即可一眼看懂目标公司并着手联系，减少重复检索。',
    priority: 'P0',
    status: 'planned',
  },
  {
    id: 'explore-intensity',
    title: '探索强度 · 高 / 中 / 低',
    description:
      '支持配置探索强度三档。用户反馈：单次探索收获的线索偏少。不同档位在扩展关键词数量、搜索引擎（R1/R2）单次结果条数、Google Maps（R3）结果集上限等方面分级，在耗时与覆盖面之间权衡。',
    priority: 'P0',
    status: 'developing',
  },
  {
    id: 'ui-theme-toggle',
    title: '界面主题 · 暗黑 / 日间模式',
    description:
      '桌面端支持暗黑、日间与跟随系统，切换后立即生效并记住本机选择。长时间审阅线索与开发信时可按环境与偏好切换，减轻视觉疲劳。',
    priority: 'P0',
    status: 'developing',
  },
  {
    id: 'library-pdf-scanned',
    title: '资料库 · 非文字型 PDF',
    description:
      '当前仅支持文字型 PDF 自动抽文本进画像；扫描件 / 图片型 PDF 暂不支持。用户反馈需纳入说明书、画册等扫描 PDF，需评估 OCR 或多模态读图方案后再拆详设。',
    priority: 'P1',
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
    id: 'onboarding-guide',
    title: '业务流程引导',
    description:
      '按录入 → 画像 → 探索 → 线索 → 开发信的主线，提供更清晰的新手引导与空态提示，减少不知道下一步该做什么的困惑。',
    priority: 'P1',
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
      '对已保存的任务编排方案支持按计划定时触发（每日/每周本地时刻），绑定产品与方案；依赖托盘常驻与可选开机自启，后台执行并在完成或异常时用系统通知提醒。',
    priority: 'P0',
    status: 'developing',
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
