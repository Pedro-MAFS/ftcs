export interface OfficialUsageSnapshot {
  balanceLi: number
  balanceYuan: number
  /** 不含 ¥ 前缀，如 12.34 / 0 / -0.5 */
  balanceDisplay: string
  liPerYuan: number
  keyPrefix?: string
  todayPromptTokens: number | null
  todayCompletionTokens: number | null
  fetchedAt: number
  error?: string
}

let usageCache: OfficialUsageSnapshot | null = null

export function getOfficialUsageCache(): OfficialUsageSnapshot | null {
  return usageCache
}

export function clearOfficialUsageCache(): void {
  usageCache = null
}

export function setOfficialUsageCache(snapshot: OfficialUsageSnapshot): void {
  usageCache = snapshot
}

/** 厘 → 展示用字符串（最多 3 位小数，去尾零） */
export function formatBalanceYuan(balanceLi: number, liPerYuan = 1000): string {
  const yuan = balanceLi / liPerYuan
  if (!Number.isFinite(yuan)) return '0'
  const fixed = yuan.toFixed(3)
  return fixed.replace(/\.?0+$/, '') || '0'
}

export function buildUsageSnapshot(input: {
  balanceLi: number
  liPerYuan: number
  keyPrefix?: string
  todayPromptTokens: number | null
  todayCompletionTokens: number | null
  error?: string
}): OfficialUsageSnapshot {
  const liPerYuan = input.liPerYuan > 0 ? input.liPerYuan : 1000
  const balanceYuan = input.balanceLi / liPerYuan
  return {
    balanceLi: input.balanceLi,
    balanceYuan,
    balanceDisplay: formatBalanceYuan(input.balanceLi, liPerYuan),
    liPerYuan,
    keyPrefix: input.keyPrefix,
    todayPromptTokens: input.todayPromptTokens,
    todayCompletionTokens: input.todayCompletionTokens,
    fetchedAt: Date.now(),
    error: input.error,
  }
}
