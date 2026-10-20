import { leadRoundTag, roundLabel } from '../explore/round-labels'
import type { LeadRowDto } from '../types/electron'
import { rowsToCsv } from './csv'

const HEADERS = [
  '公司',
  '阶段',
  '生命周期',
  '域名',
  '国家',
  '联系方式',
  '关键联系人',
  'Tier',
  '评分',
  '匹配理由',
  '来源URL',
] as const

function contactsExport(row: LeadRowDto): string {
  return (row.contacts || [])
    .map((contact) => contact.value.trim())
    .filter(Boolean)
    .join(',')
}

function peopleExport(row: LeadRowDto): string {
  return (row.people || [])
    .map((person) => {
      const name = person.name.trim()
      const contact = person.email.trim()
      if (name && contact) return `${name}：${contact}`
      return name || contact
    })
    .filter(Boolean)
    .join('；')
}

function phaseLabel(phase: LeadRowDto['phase']): string {
  if (phase === 'scored') return '已评分'
  if (phase === 'discarded') return '重复淘汰'
  return '未评分'
}

function lifecycleLabel(status: string | null | undefined): string {
  if (!status || status === 'new') return ''
  const map: Record<string, string> = {
    reviewed: '已审阅',
    email_drafted: '已写邮件',
    email_approved: '邮件已通过',
    contacted: '已触达',
    replied: '已回复',
    converted: '已转化',
    rejected: '已拒绝',
  }
  return map[status] || status
}

/** 线索表展示。导出文件仍用 matchReasonDisplay，保留原轮次标记。 */
export function matchReasonScreen(row: LeadRowDto): string {
  if (row.phase === 'discarded') {
    const kept = row.keptLeadId || '—'
    return row.matchReason ? `保留 ${kept} · ${row.matchReason}` : `保留 ${kept}`
  }
  if (row.matchReason) {
    return `${roundLabel(row.round || 'R1')} · ${row.matchReason}`
  }
  return ''
}

/** 导出文件内容。界面请用 matchReasonScreen。 */
export function matchReasonDisplay(row: LeadRowDto): string {
  if (row.phase === 'discarded') {
    const kept = row.keptLeadId || '—'
    return row.matchReason ? `保留 ${kept} · ${row.matchReason}` : `保留 ${kept}`
  }
  if (row.matchReason) {
    return `${leadRoundTag(row.round)} · ${row.matchReason}`
  }
  return ''
}

function sourceUrl(row: LeadRowDto): string {
  return row.sourceUrl || row.source?.url || ''
}

export function buildLeadsCsv(rows: LeadRowDto[]): string {
  const data = rows.map((row) => [
    row.companyName || '',
    phaseLabel(row.phase),
    lifecycleLabel(row.status),
    row.domain || '',
    row.country || '',
    contactsExport(row),
    peopleExport(row),
    row.tierLabel || '',
    row.score != null ? String(row.score) : '',
    matchReasonDisplay(row),
    sourceUrl(row),
  ])
  return rowsToCsv([...HEADERS], data)
}

export function defaultLeadsCsvFileName(
  productId: string,
  options?: { runId?: string },
): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('')
  const pid = productId.trim() || 'leads'
  const run = options?.runId?.trim()
  return run ? `leads_${pid}_${run}_${stamp}.csv` : `leads_${pid}_${stamp}.csv`
}
