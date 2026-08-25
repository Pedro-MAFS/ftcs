export function isEligibleR2Query(query: { round: string; site_id?: string }): boolean {
  return String(query.round).toUpperCase() === 'R2' && Boolean(query.site_id?.trim())
}

export function countEligibleR2Queries(expansion: {
  search_queries: Array<{ round: string; site_id?: string }>
}): number {
  return expansion.search_queries.filter(isEligibleR2Query).length
}

export function exploreRunTitle(rounds: string[]): string {
  if (rounds.length === 1) {
    const round = rounds[0]
    if (round === 'R1') return 'R1 广撒网'
    if (round === 'R2') return 'R2 社媒发现'
    if (round === 'R3') return 'R3 规划中'
    if (round === 'R4') return 'R4 规划中'
  }
  return rounds.join('+') || '探索任务'
}
