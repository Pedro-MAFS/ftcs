import type { ExploreIntensity } from './explore-intensity-logic'

const SHORT_LABEL: Record<ExploreIntensity, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

export function exploreIntensityShortLabel(intensity: ExploreIntensity): string {
  return SHORT_LABEL[intensity]
}

/** 扩展关键词指令中的数量规则。数字只来自调用方传入的 T。 */
export function formatExpandKeywordsTargets(
  target: number,
  intensity: ExploreIntensity,
): string {
  return [
    `探索强度：${intensity}`,
    `关键词目标 keyword_target_per_round：${target}`,
    `- R1 目标：${target} 条（尽可能达到；无 site_id）`,
    `- R2 目标：每个当前启用社媒各 ${target} 条（每条必须带 site_id；未启用站不出词；0 个启用站则不要 R2）`,
    `- R3 目标：${target} 条（城市/区域 + 品类/场景；无 site_id；用更多地理位置与不同搜法接近目标，禁止同义反复凑数）`,
    '- 不设 search_queries 总数上限；不要 round=R4',
    '- 产品简单、再写会重复或空泛时允许少于目标；保存后摘要须写明各轮实际条数与目标，低于目标时用一句话说明原因',
    '- 质量：像真人会搜的词；不捏造画像没有的认证、规格或竞品专名',
  ].join('\n')
}

export function formatExpandKeywordsDoneMessage(
  productId: string,
  total: number,
  intensity: ExploreIntensity,
  target: number,
): string {
  const label = exploreIntensityShortLabel(intensity)
  return `关键词已扩展：${productId} · ${total} 条搜索词 · 按${label}档目标 ${target}`
}
