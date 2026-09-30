export type ExploreIntensity = 'low' | 'medium' | 'high'

export type ExploreIntensityLimits = {
  /** R1 广撒网搜索词目标 */
  keywordTargetR1: number
  /** 每个启用社媒的 R2、以及 R3 的目标 */
  keywordTargetPerRound: number
  searchNumResults: number
  placesResultLimit: number
  /** 详情 / 补官网共用比例，向下取整由调用方算 */
  threeQuartersRatio: 0.75
}

const LIMITS: Record<ExploreIntensity, ExploreIntensityLimits> = {
  low: {
    keywordTargetR1: 20,
    keywordTargetPerRound: 10,
    searchNumResults: 3,
    placesResultLimit: 10,
    threeQuartersRatio: 0.75,
  },
  medium: {
    keywordTargetR1: 40,
    keywordTargetPerRound: 20,
    searchNumResults: 5,
    placesResultLimit: 20,
    threeQuartersRatio: 0.75,
  },
  high: {
    keywordTargetR1: 60,
    keywordTargetPerRound: 40,
    searchNumResults: 10,
    placesResultLimit: 40,
    threeQuartersRatio: 0.75,
  },
}

export function resolveExploreIntensity(raw: unknown): ExploreIntensity {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

export function getExploreIntensityLimitsFor(
  intensity: ExploreIntensity,
): ExploreIntensityLimits {
  return LIMITS[resolveExploreIntensity(intensity)]
}

/** 详情上限 / 补官网次数：⌊n × 3/4⌋ */
export function floorThreeQuarters(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n * 0.75)
}
