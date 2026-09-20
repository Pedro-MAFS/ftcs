const KNOWN_SKILLS = new Set([
  'extract-product-profile',
  'expand-keywords',
  'discover-leads',
  'discover-leads-r2',
  'discover-leads-r3',
  'score-and-dedupe',
  'enrich-lead-contacts',
  'draft-outreach-email',
  'translate-outreach-email',
])

const PATH_HINT =
  /(?:[A-Za-z]:\\|\/users\/|\/home\/|\\\\|draft\.json|profile\.json|data\/emails|data\/profiles)/i

export type FormatTaskDoneNotifyBodyInput = {
  skill: string
  ok: boolean
  message: string
}

function isDraftSlot(message: string): boolean {
  return message.includes('单槽')
}

function isDraftEmpty(message: string): boolean {
  return message.includes('暂无待起草') || message.includes('未指定有效')
}

function isDiscoverSkill(skill: string): boolean {
  return (
    skill === 'discover-leads' ||
    skill === 'discover-leads-r2' ||
    skill === 'discover-leads-r3'
  )
}

/** skill + message → 任务显示名（中止/失败用） */
export function taskLabelForNotify(skill: string, message: string): string {
  if (skill === 'extract-product-profile') return '产品画像'
  if (skill === 'expand-keywords') return '关键词扩展'
  if (skill === 'discover-leads') return 'R1 广撒网'
  if (skill === 'discover-leads-r2') return 'R2 社媒发现'
  if (skill === 'discover-leads-r3') return 'R3 地图发现'
  if (skill === 'score-and-dedupe') return '评分去重'
  if (skill === 'enrich-lead-contacts') return '补全联系人'
  if (skill === 'translate-outreach-email') return '中文对照'
  if (skill === 'draft-outreach-email') {
    return isDraftSlot(message) ? '开发信单人起草' : '开发信起草'
  }
  return '任务'
}

function parseKeywordCount(message: string): number | null {
  const m = message.match(/(\d+)\s*条搜索词/)
  if (!m) return null
  return Number.parseInt(m[1], 10)
}

function parseLeadCount(message: string): number | null {
  const m = message.match(/线索\s*(\d+)/)
  if (!m) return null
  return Number.parseInt(m[1], 10)
}

function parseScoreTiers(
  message: string,
): { h: number; m: number; l: number } | null {
  const m = message.match(/A\s*(\d+)\s*\/\s*B\s*(\d+)\s*\/\s*C\s*(\d+)/)
  if (!m) return null
  return {
    h: Number.parseInt(m[1], 10),
    m: Number.parseInt(m[2], 10),
    l: Number.parseInt(m[3], 10),
  }
}

function parseDraftLetterCount(message: string): number | null {
  const m = message.match(/邮件起草完成：(\d+)\s*封/)
  if (!m) return null
  return Number.parseInt(m[1], 10)
}

function truncateReason(raw: string, max = 40): string {
  const value = raw.trim()
  if (!value) return '详见应用内时间线'
  if (PATH_HINT.test(value)) return '详见应用内时间线'
  const chars = [...value]
  if (chars.length <= max) return value
  return `${chars.slice(0, max).join('')}…`
}

function formatSuccessBody(skill: string, message: string): string {
  if (skill === 'extract-product-profile') return '产品画像已生成'

  if (skill === 'expand-keywords') {
    const n = parseKeywordCount(message)
    return n != null
      ? `关键词扩展已完成（${n} 条搜索词）`
      : '关键词扩展已完成'
  }

  if (skill === 'discover-leads') {
    const n = parseLeadCount(message)
    return n != null ? `R1 广撒网已完成（线索 ${n}）` : 'R1 广撒网已完成'
  }
  if (skill === 'discover-leads-r2') {
    const n = parseLeadCount(message)
    return n != null ? `R2 社媒发现已完成（线索 ${n}）` : 'R2 社媒发现已完成'
  }
  if (skill === 'discover-leads-r3') {
    const n = parseLeadCount(message)
    return n != null ? `R3 地图发现已完成（线索 ${n}）` : 'R3 地图发现已完成'
  }

  if (skill === 'score-and-dedupe') {
    const tiers = parseScoreTiers(message)
    return tiers
      ? `评分去重已完成（A ${tiers.h} / B ${tiers.m} / C ${tiers.l}）`
      : '评分去重已完成'
  }

  if (skill === 'enrich-lead-contacts') {
    return message.includes('批量')
      ? '批量补全联系人已完成'
      : '补全联系人已完成'
  }

  if (skill === 'draft-outreach-email') {
    if (isDraftSlot(message)) return '开发信单人起草已完成'
    if (isDraftEmpty(message)) return '开发信：暂无待起草线索'
    const n = parseDraftLetterCount(message)
    return n != null ? `开发信起草已完成（${n} 封）` : '开发信起草已完成'
  }

  if (skill === 'translate-outreach-email') return '中文对照已生成'

  if (!skill || !KNOWN_SKILLS.has(skill)) return '任务已完成'
  return '任务已完成'
}

function formatAbortBody(skill: string, message: string): string {
  if (!skill || !KNOWN_SKILLS.has(skill)) return '已中止：任务'
  return `已中止：${taskLabelForNotify(skill, message)}`
}

function formatFailBody(skill: string, message: string): string {
  if (isDiscoverSkill(skill)) {
    return `失败：${taskLabelForNotify(skill, message)} · 详见应用内时间线`
  }
  const label =
    skill && KNOWN_SKILLS.has(skill)
      ? taskLabelForNotify(skill, message)
      : '任务'
  const reason = truncateReason(message)
  return `失败：${label} · ${reason}`
}

/** 按 US-N-02 §5 生成系统通知正文 */
export function formatTaskDoneNotifyBody(
  input: FormatTaskDoneNotifyBodyInput,
): string {
  const skill = (input.skill || '').trim()
  const message = input.message || ''

  if (input.ok) {
    return formatSuccessBody(skill, message)
  }
  if (/中止/.test(message)) {
    return formatAbortBody(skill, message)
  }
  return formatFailBody(skill, message)
}
