import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

export type LeadPhase = 'raw' | 'scored' | 'discarded'
export type LeadTier = 'high' | 'medium' | 'low' | null
export type LeadLifecycleStatus =
  | 'new'
  | 'reviewed'
  | 'email_drafted'
  | 'email_approved'
  | 'contacted'
  | 'replied'
  | 'converted'
  | 'rejected'
  | null

export interface LeadContact {
  type: string
  value: string
  confidence?: string
}

export interface LeadCompanyDetail {
  name: string
  website: string
  country: string
  description: string
}

export interface LeadSourceDetail {
  url: string
  type: string
  snippet: string
}

export interface LeadScoreBreakdown {
  product_match: number
  purchase_intent: number
  size_fit: number
  geo_match: number
  reachability: number
  competition: number
}

export interface LeadRow {
  id: string
  productId: string
  phase: LeadPhase
  companyName: string
  domain: string
  country: string
  tier: LeadTier
  /** UI：A / B / C，未评分为空 */
  tierLabel: string
  score: number | null
  matchReason: string
  sourceUrl: string
  round: string
  status: LeadLifecycleStatus
  discoveredAt: string
  queryId: string
  rawScore: number | null
  dedupeKey: string
  /** 淘汰线索指向保留的 scored lead id */
  keptLeadId: string
  discardReason: string
  company: LeadCompanyDetail
  source: LeadSourceDetail
  scoreBreakdown: LeadScoreBreakdown | null
  contacts: LeadContact[]
  /** 表格主展示：优先邮箱，多条时带 · +N */
  contactLabel: string
  /** 落盘原始对象，供抽屉完整展示 */
  record: Record<string, unknown>
}

export interface LeadsSnapshot {
  productId: string
  updatedAt?: string
  rows: LeadRow[]
  stats: {
    total: number
    raw: number
    scored: number
    discarded: number
    byTier: { high: number; medium: number; low: number }
    pendingMail: number
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function domainFromUrl(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    return new URL(withProto).hostname.replace(/^www\./i, '')
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''
  }
}

function tierLabel(tier: LeadTier): string {
  if (tier === 'high') return 'A'
  if (tier === 'medium') return 'B'
  if (tier === 'low') return 'C'
  return ''
}

function parseTier(value: unknown): LeadTier {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return null
}

function parseLifecycle(value: unknown): LeadLifecycleStatus {
  const allowed: LeadLifecycleStatus[] = [
    'new',
    'reviewed',
    'email_drafted',
    'email_approved',
    'contacted',
    'replied',
    'converted',
    'rejected',
  ]
  if (typeof value === 'string' && (allowed as string[]).includes(value)) {
    return value as LeadLifecycleStatus
  }
  return null
}

const CONTACT_PRIORITY = ['email', 'phone', 'linkedin', 'form']

function parseContacts(value: unknown): LeadContact[] {
  if (!Array.isArray(value)) return []
  const out: LeadContact[] = []
  for (const item of value) {
    const row = asRecord(item)
    if (!row) continue
    const type = asString(row.type) || 'email'
    const contactValue = asString(row.value).trim()
    if (!contactValue) continue
    const confidence = asString(row.confidence) || undefined
    out.push({ type, value: contactValue, confidence })
  }
  return out.sort((a, b) => {
    const ia = CONTACT_PRIORITY.indexOf(a.type)
    const ib = CONTACT_PRIORITY.indexOf(b.type)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

function formatContactLabel(contacts: LeadContact[]): string {
  if (contacts.length === 0) return ''
  const primary = contacts[0]!.value
  const extra = contacts.length - 1
  return extra > 0 ? `${primary} · +${extra}` : primary
}

function parseCompany(value: unknown): LeadCompanyDetail {
  const company = asRecord(value) ?? {}
  return {
    name: asString(company.name),
    website: asString(company.website),
    country: asString(company.country),
    description: asString(company.description),
  }
}

function parseSource(value: unknown, fallbackUrl = ''): LeadSourceDetail {
  const source = asRecord(value) ?? {}
  return {
    url: asString(source.url) || fallbackUrl,
    type: asString(source.type),
    snippet: asString(source.snippet),
  }
}

function parseScoreBreakdown(value: unknown): LeadScoreBreakdown | null {
  const row = asRecord(value)
  if (!row) return null
  const keys: Array<keyof LeadScoreBreakdown> = [
    'product_match',
    'purchase_intent',
    'size_fit',
    'geo_match',
    'reachability',
    'competition',
  ]
  const out: Partial<LeadScoreBreakdown> = {}
  let any = false
  for (const key of keys) {
    const n = asNumber(row[key])
    if (n != null) {
      out[key] = n
      any = true
    } else {
      out[key] = 0
    }
  }
  return any ? (out as LeadScoreBreakdown) : null
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return { ...value }
  }
}

export function getRawLeadsDir(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'raw')
}

export function getScoredLeadsPath(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'scored.json')
}

function getDiscardedLeadsPath(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'discarded.json')
}

function loadRawLeads(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): LeadRow[] {
  const dir = getRawLeadsDir(productId, workspaceRoot)
  if (!fs.existsSync(dir)) return []

  const rows: LeadRow[] = []
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.jsonl'))
    .sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    const filePath = path.join(dir, file)
    let text = ''
    try {
      text = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = asRecord(JSON.parse(trimmed))
        if (!raw) continue
        const company = parseCompany(raw.company)
        const source = parseSource(raw.source)
        const domain = domainFromUrl(company.website || source.url)
        const contacts = parseContacts(raw.contacts)
        rows.push({
          id: asString(raw.id) || `raw_${rows.length + 1}`,
          productId: asString(raw.product_id) || productId,
          phase: 'raw',
          companyName: company.name || domain || '未命名公司',
          domain,
          country: company.country.toUpperCase(),
          tier: null,
          tierLabel: '',
          score: null,
          matchReason: asString(raw.match_reason),
          sourceUrl: source.url,
          round: asString(raw.round) || 'R1',
          status: null,
          discoveredAt: asString(raw.discovered_at),
          queryId: asString(raw.query_id),
          rawScore: asNumber(raw.raw_score),
          dedupeKey: '',
          keptLeadId: '',
          discardReason: '',
          company,
          source,
          scoreBreakdown: null,
          contacts,
          contactLabel: formatContactLabel(contacts),
          record: cloneRecord(raw),
        })
      } catch {
        // skip bad line
      }
    }
  }

  return rows
}

function loadDiscardedLeads(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): LeadRow[] {
  const filePath = getDiscardedLeadsPath(productId, workspaceRoot)
  if (!fs.existsSync(filePath)) return []

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    const root = asRecord(parsed)
    if (!root) return []
    const leads = Array.isArray(root.leads) ? root.leads : []
    const rows: LeadRow[] = []

    for (const item of leads) {
      const raw = asRecord(item)
      if (!raw) continue
      const company = parseCompany(raw.company)
      const source = parseSource(raw.source)
      const dedupeKey = asString(raw.dedupe_key)
      const domain = dedupeKey || domainFromUrl(company.website || source.url)
      const contacts = parseContacts(raw.contacts)
      const keptLeadId = asString(raw.kept_lead_id)
      const reason = asString(raw.reason) || 'duplicate_domain'
      const matchReason =
        asString(raw.match_reason) ||
        (keptLeadId
          ? `同域名重复，已保留 ${keptLeadId}`
          : '同域名重复，评分去重时淘汰')
      rows.push({
        id: asString(raw.id) || `discarded_${rows.length + 1}`,
        productId: asString(raw.product_id) || productId,
        phase: 'discarded',
        companyName: company.name || domain || '未命名公司',
        domain,
        country: company.country.toUpperCase(),
        tier: null,
        tierLabel: '',
        score: null,
        matchReason,
        sourceUrl: source.url,
        round: asString(raw.round) || '',
        status: null,
        discoveredAt: asString(raw.discovered_at),
        queryId: asString(raw.query_id),
        rawScore: asNumber(raw.raw_score),
        dedupeKey,
        keptLeadId,
        discardReason: reason,
        company,
        source,
        scoreBreakdown: null,
        contacts,
        contactLabel: formatContactLabel(contacts),
        record: cloneRecord(raw),
      })
    }

    return rows
  } catch {
    return []
  }
}

function loadScoredLeads(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): { rows: LeadRow[]; updatedAt?: string } {
  const filePath = getScoredLeadsPath(productId, workspaceRoot)
  if (!fs.existsSync(filePath)) return { rows: [] }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    const root = asRecord(parsed)
    if (!root) return { rows: [] }
    const leads = Array.isArray(root.leads) ? root.leads : []
    const rows: LeadRow[] = []

    for (const item of leads) {
      const raw = asRecord(item)
      if (!raw) continue
      const company = parseCompany(raw.company)
      const sourceUrl = asString(raw.source_url)
      const source = parseSource(raw.source, sourceUrl)
      if (!source.url) source.url = sourceUrl
      const domain = domainFromUrl(company.website || source.url)
      const tier = parseTier(raw.tier)
      const score = asNumber(raw.score)
      const contacts = parseContacts(raw.contacts)
      rows.push({
        id: asString(raw.id) || `scored_${rows.length + 1}`,
        productId: asString(raw.product_id) || productId,
        phase: 'scored',
        companyName: company.name || domain || '未命名公司',
        domain,
        country: company.country.toUpperCase(),
        tier,
        tierLabel: tierLabel(tier),
        score,
        matchReason: asString(raw.match_reason),
        sourceUrl: source.url || sourceUrl,
        round: asString(raw.round) || '',
        status: parseLifecycle(raw.status),
        discoveredAt: asString(raw.discovered_at),
        queryId: asString(raw.query_id),
        rawScore: asNumber(raw.raw_score),
        dedupeKey: asString(raw.dedupe_key),
        keptLeadId: '',
        discardReason: '',
        company,
        source,
        scoreBreakdown: parseScoreBreakdown(raw.score_breakdown),
        contacts,
        contactLabel: formatContactLabel(contacts),
        record: cloneRecord(raw),
      })
    }

    return {
      rows,
      updatedAt: asString(root.updated_at) || undefined,
    }
  } catch {
    return { rows: [] }
  }
}

export function countRawLeads(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): number {
  return loadRawLeads(productId, workspaceRoot).length
}

export type ScoredLeadsArtifact = {
  productId: string
  updatedAt: string
  total: number
  byTier: { high: number; medium: number; low: number }
}

/** 读取 scored.json 摘要；供 Agent 结束后校验产物 */
export function loadScoredArtifact(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): ScoredLeadsArtifact | null {
  const filePath = getScoredLeadsPath(productId, workspaceRoot)
  if (!fs.existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    const root = asRecord(parsed)
    if (!root) return null
    const leads = Array.isArray(root.leads) ? root.leads : []
    const stats = asRecord(root.stats) ?? {}
    const byTierRaw = asRecord(stats.by_tier) ?? {}
    const byTier = {
      high: Number(byTierRaw.high) || 0,
      medium: Number(byTierRaw.medium) || 0,
      low: Number(byTierRaw.low) || 0,
    }
    if (byTier.high + byTier.medium + byTier.low === 0) {
      for (const item of leads) {
        const row = asRecord(item)
        const tier = parseTier(row?.tier)
        if (tier === 'high') byTier.high += 1
        else if (tier === 'medium') byTier.medium += 1
        else if (tier === 'low') byTier.low += 1
      }
    }
    return {
      productId: asString(root.product_id) || productId,
      updatedAt: asString(root.updated_at),
      total:
        typeof stats.total === 'number' ? stats.total : leads.length,
      byTier,
    }
  } catch {
    return null
  }
}

const PHASE_ORDER: Record<LeadPhase, number> = {
  scored: 0,
  raw: 1,
  discarded: 2,
}

/** 合并 scored + discarded + 未处理 raw：同 id 优先 scored，其次 discarded */
export function listLeadsSnapshot(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): LeadsSnapshot {
  const scored = loadScoredLeads(productId, workspaceRoot)
  const discarded = loadDiscardedLeads(productId, workspaceRoot)
  const raw = loadRawLeads(productId, workspaceRoot)
  const scoredIds = new Set(scored.rows.map((r) => r.id))
  const discardedIds = new Set(discarded.map((r) => r.id))

  const pendingRaw = raw.filter(
    (r) => !scoredIds.has(r.id) && !discardedIds.has(r.id),
  )
  const rows = [...scored.rows, ...pendingRaw, ...discarded].sort((a, b) => {
    const phaseDiff = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]
    if (phaseDiff !== 0) return phaseDiff
    const scoreA = a.score ?? -1
    const scoreB = b.score ?? -1
    if (scoreA !== scoreB) return scoreB - scoreA
    return (b.discoveredAt || '').localeCompare(a.discoveredAt || '')
  })

  const byTier = { high: 0, medium: 0, low: 0 }
  let pendingMail = 0
  for (const row of scored.rows) {
    if (row.tier === 'high') byTier.high += 1
    else if (row.tier === 'medium') byTier.medium += 1
    else if (row.tier === 'low') byTier.low += 1
    if (!row.status || row.status === 'new' || row.status === 'reviewed') {
      pendingMail += 1
    }
  }

  return {
    productId,
    updatedAt: scored.updatedAt,
    rows,
    stats: {
      total: rows.length,
      raw: pendingRaw.length,
      scored: scored.rows.length,
      discarded: discarded.length,
      byTier,
      pendingMail,
    },
  }
}
