import type { ExploreIntensity } from './explore-intensity-logic'

/** 探索任务指令里的搜索条数与补官网规则。数字只来自调用方传入的 searchNumResults。 */
export function formatDiscoverSearchLimits(
  searchNumResults: number,
  intensity: ExploreIntensity,
): string {
  return [
    `探索强度：${intensity}`,
    `search_num_results：${searchNumResults}`,
    '- 所有 search_web（含 R2 社媒、R2/R3 补官网）的 num_results 必须用此值（上限 10，已是档位硬顶）',
    '- 补官网：每词次数上限 = floor(本次主结果实际返回条数 × 0.75)；已有官网的条目不消耗次数；不要再用「每词 2 / 每轮 20」',
    '- 官网 chrome 打开：已解析出的公司官网都打开，再判断是否目标客户。不设每词打开次数，也不设每轮打开次数。同域名已有线索则不重复打开；社媒页、目录页、打不开或判断为否的不写线索',
  ].join('\n')
}
