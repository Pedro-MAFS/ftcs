export const ROUND_FILTER_OPTIONS = [
  { value: 'all', label: '全部轮次' },
  { value: 'R1', label: 'R1 广撒网' },
  { value: 'R2', label: 'R2 社媒发现' },
  { value: 'R3', label: 'R3 地图发现' },
  { value: 'R4', label: 'R4 规划中' },
] as const

export const ROUND_SELECT_OPTIONS = ROUND_FILTER_OPTIONS.filter(
  (opt) => opt.value !== 'all',
)

export const R3_EMPTY =
  '暂无 R3 地图发现词，请在画像页重新「扩展关键词」。'

export const R4_PLANNED_EMPTY =
  'R4 黄页名录仍待评审，扩展时不生成 R4 词。'

/** @deprecated 使用 R4_PLANNED_EMPTY */
export const PLANNED_ROUND_EMPTY = R4_PLANNED_EMPTY

export function roundLabel(round: string): string {
  return ROUND_FILTER_OPTIONS.find((opt) => opt.value === round)?.label ?? round
}

/** 线索表 / CSV「匹配理由」前的轮次标记 */
export function leadRoundTag(round?: string | null): string {
  const value = (round || 'R1').trim().toUpperCase()
  if (value === 'R2' || value === 'R3' || value === 'R4') return value
  return 'R1'
}
