const FORBIDDEN_CHANNEL_QUERY_OPERATOR = /\b(site|intitle|inurl|filetype)\s*:/i

function forbiddenOperatorMessage(round: string): string {
  return `${round} 搜索词不能包含 site: / intitle: / inurl: / filetype:`
}

export function validateSearchQueryForSave(
  row: {
    query: string
    round: string
    site_id?: string
  },
  knownSiteIds?: Set<string>,
): string | null {
  const round = row.round.toUpperCase()
  const siteId = row.site_id?.trim()
  if (round === 'R2') {
    if (!siteId) return 'R2 搜索词必须选择站点'
    if (knownSiteIds && !knownSiteIds.has(siteId)) {
      return `未知的 R2 站点：${siteId}`
    }
    if (FORBIDDEN_CHANNEL_QUERY_OPERATOR.test(row.query)) {
      return forbiddenOperatorMessage('R2')
    }
    return null
  }
  if (siteId) return '只有 R2 搜索词可以带站点'
  if (round === 'R3' && FORBIDDEN_CHANNEL_QUERY_OPERATOR.test(row.query)) {
    return forbiddenOperatorMessage('R3')
  }
  return null
}
