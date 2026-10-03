/** 距上次成功检查再查一次的间隔。 */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 一次性定时器的延迟：max(0, lastCheckedAt + 24h - now)。 */
export function delayUntilNextUpdateCheck(lastCheckedAt: string, now = Date.now()): number {
  const last = Date.parse(lastCheckedAt)
  if (!Number.isFinite(last)) return UPDATE_CHECK_INTERVAL_MS
  return Math.max(0, last + UPDATE_CHECK_INTERVAL_MS - now)
}
