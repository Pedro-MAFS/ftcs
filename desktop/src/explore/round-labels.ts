export const ROUND_FILTER_OPTIONS = [
  { value: 'all', label: '全部轮次' },
  { value: 'R1', label: 'R1 广撒网' },
  { value: 'R2', label: 'R2 社媒发现' },
  { value: 'R3', label: 'R3 规划中' },
  { value: 'R4', label: 'R4 规划中' },
] as const

export const ROUND_SELECT_OPTIONS = ROUND_FILTER_OPTIONS.filter(
  (opt) => opt.value !== 'all',
)

export const PLANNED_ROUND_EMPTY =
  'R3 / R4 本阶段规划中，扩展关键词时不再生成这类词。'

export function roundLabel(round: string): string {
  return ROUND_FILTER_OPTIONS.find((opt) => opt.value === round)?.label ?? round
}
