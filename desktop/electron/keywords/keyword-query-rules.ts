const R2_QUERY_OPERATOR = /\b(site|intitle|inurl|filetype)\s*:/i

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
    if (R2_QUERY_OPERATOR.test(row.query)) {
      return 'R2 搜索词不能包含 site: / intitle: / inurl: / filetype:'
    }
    return null
  }
  if (siteId) return '只有 R2 搜索词可以带站点'
  return null
}
