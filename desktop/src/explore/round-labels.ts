export const ROUND_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'R1', label: '全网搜索' },
  { value: 'R2', label: '社媒发现' },
  { value: 'R3', label: '地图发现' },
  { value: 'R4', label: '规划中' },
] as const

export const ROUND_SELECT_OPTIONS = ROUND_FILTER_OPTIONS.filter(
  (opt) => opt.value !== 'all',
)

export const R3_EMPTY =
  '暂无地图发现词，请在画像页重新「扩展关键词」。'

export const R4_PLANNED_EMPTY = '这一类仍在规划中，扩展时不会生成。'

/** @deprecated 使用 R4_PLANNED_EMPTY */
export const PLANNED_ROUND_EMPTY = R4_PLANNED_EMPTY

export function roundLabel(round: string): string {
  return ROUND_FILTER_OPTIONS.find((opt) => opt.value === round)?.label ?? round
}

/** 多个轮次拼成用户可见名称，例如「全网搜索 + 社媒发现」。 */
export function formatRounds(rounds: string[]): string {
  if (rounds.length === 0) return roundLabel('R1')
  return rounds.map((round) => roundLabel(round)).join(' + ')
}

/** 线索表 / CSV「匹配理由」前的轮次标记 */
export function leadRoundTag(round?: string | null): string {
  const value = (round || 'R1').trim().toUpperCase()
  if (value === 'R2' || value === 'R3' || value === 'R4') return value
  return 'R1'
}
