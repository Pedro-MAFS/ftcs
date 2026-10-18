export function isEligibleR2Query(query: { round: string; site_id?: string }): boolean {
  return String(query.round).toUpperCase() === 'R2' && Boolean(query.site_id?.trim())
}

export function countEligibleR2Queries(expansion: {
  search_queries: Array<{ round: string; site_id?: string }>
}): number {
  return expansion.search_queries.filter(isEligibleR2Query).length
}

const ROUND_TITLES: Record<string, string> = {
  R1: '全网搜索',
  R2: '社媒发现',
  R3: '地图发现',
  R4: '规划中',
}

export function exploreRunTitle(rounds: string[]): string {
  if (rounds.length === 0) return '探索任务'
  return rounds.map((round) => ROUND_TITLES[round] ?? round).join(' + ')
}
