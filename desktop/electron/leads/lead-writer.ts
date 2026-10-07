import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import {
  getScoredLeadsPath,
  listLeadsSnapshot,
  type CompanyIntelligence,
  type LeadRow,
} from './leads-reader'

export interface RawLeadContactEdit {
  type: string
  value: string
  confidence?: string
}

export interface RawLeadSaveInput {
  productId: string
  leadId: string
  company: {
    name?: string
    website?: string
    country?: string
    description?: string
  }
  source: {
    url: string
    type?: string
    snippet?: string
  }
  match_reason: string
  contacts: RawLeadContactEdit[]
  raw_score?: number | null
}

export interface RawLeadSaveResult {
  ok: boolean
  message: string
  lead?: LeadRow
}

const CONTACT_TYPES = new Set(['email', 'phone', 'form', 'linkedin'])
const CONTACT_CONFIDENCE = new Set(['high', 'medium', 'low'])
const SOURCE_TYPES = new Set(['tavily_search', 'google_search', 'manual'])
const ROUNDS = new Set(['R1', 'R2', 'R3', 'R4'])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getRawLeadsDir(productId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'raw')
}

function normalizeContact(raw: RawLeadContactEdit): Record<string, unknown> | null {
  const value = cleanString(raw.value)
  if (!value) return null
  const type = cleanString(raw.type).toLowerCase() || 'email'
  const contact: Record<string, unknown> = {
    type: CONTACT_TYPES.has(type) ? type : 'email',
    value,
  }
  const confidence = cleanString(raw.confidence).toLowerCase()
  if (CONTACT_CONFIDENCE.has(confidence)) {
    contact.confidence = confidence
  }
  return contact
}

function applyEdits(
  existing: Record<string, unknown>,
  input: RawLeadSaveInput,
): Record<string, unknown> {
  const sourceUrl = cleanString(input.source.url)
  if (!sourceUrl) {
    throw new Error('来源 URL 不能为空')
  }

  const existingCompany = asRecord(existing.company) ?? {}
  const existingSource = asRecord(existing.source) ?? {}
  const sourceTypeRaw = cleanString(input.source.type) || cleanString(existingSource.type) || 'tavily_search'
  const sourceType = SOURCE_TYPES.has(sourceTypeRaw) ? sourceTypeRaw : 'tavily_search'

  const contacts = (input.contacts ?? [])
    .map(normalizeContact)
    .filter((item): item is Record<string, unknown> => Boolean(item))

  const next: Record<string, unknown> = {
    ...existing,
    id: cleanString(existing.id) || input.leadId,
    product_id: cleanString(existing.product_id) || input.productId,
    discovered_at: cleanString(existing.discovered_at) || new Date().toISOString(),
    round: ROUNDS.has(cleanString(existing.round))
      ? cleanString(existing.round)
      : 'R1',
    query_id: cleanString(existing.query_id),
    company: {
      // 保留未编辑的扩展字段
      ...Object.fromEntries(
        Object.entries(existingCompany).filter(
          ([key]) => !['name', 'website', 'country', 'description'].includes(key),
        ),
      ),
      name: cleanString(input.company.name) || undefined,
      website: cleanString(input.company.website) || undefined,
      country: cleanString(input.company.country).toUpperCase() || undefined,
      description: cleanString(input.company.description) || undefined,
    },
    source: {
      ...existingSource,
      url: sourceUrl,
      type: sourceType,
      snippet: cleanString(input.source.snippet) || undefined,
    },
    match_reason: cleanString(input.match_reason),
    contacts,
  }

  // 清理 company 中值为 undefined 的键，避免落盘脏字段
  const company = asRecord(next.company)
  if (company) {
    for (const key of Object.keys(company)) {
      if (company[key] === undefined) delete company[key]
    }
  }
  const source = asRecord(next.source)
  if (source && source.snippet === undefined) delete source.snippet

  if (typeof input.raw_score === 'number' && Number.isFinite(input.raw_score)) {
    next.raw_score = input.raw_score
  } else if (input.raw_score === null) {
    delete next.raw_score
  }

  return next
}

/**
 * 按 id 更新 raw/{Rn}.jsonl 中的一条线索（人工确认编辑）。
 * 与画像修改一致：桌面主进程直接写盘，不经 MCP。
 */
export function saveRawLead(
  input: RawLeadSaveInput,
  workspaceRoot = getWorkspaceRoot(),
): RawLeadSaveResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  if (!productId) {
    return { ok: false, message: '缺少 productId' }
  }
  if (!leadId) {
    return { ok: false, message: '缺少 leadId' }
  }

  const dir = getRawLeadsDir(productId, workspaceRoot)
  if (!fs.existsSync(dir)) {
    return { ok: false, message: `未找到原始线索目录：${productId}` }
  }

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

    const lines = text.split('\n')
    let foundIndex = -1
    let parsed: Record<string, unknown> | null = null

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i]!.trim()
      if (!trimmed) continue
      try {
        const row = asRecord(JSON.parse(trimmed))
        if (!row) continue
        if (cleanString(row.id) === leadId) {
          foundIndex = i
          parsed = row
          break
        }
      } catch {
        // skip bad line
      }
    }

    if (foundIndex < 0 || !parsed) continue

    try {
      const updated = applyEdits(parsed, input)
      const rewritten: string[] = []
      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i]!.trim()
        if (!trimmed) continue
        if (i === foundIndex) {
          rewritten.push(JSON.stringify(updated))
          continue
        }
        try {
          JSON.parse(trimmed)
          rewritten.push(trimmed)
        } catch {
          // drop invalid
        }
      }
      fs.writeFileSync(filePath, `${rewritten.join('\n')}\n`, 'utf8')

      const snapshot = listLeadsSnapshot(productId, workspaceRoot)
      const lead = snapshot.rows.find((row) => row.id === leadId)
      return {
        ok: true,
        message: '未评分线索已保存',
        lead,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return {
    ok: false,
    message: `未在 raw/*.jsonl 中找到线索 ${leadId}（仅支持修改未评分原始线索）`,
  }
}

export interface SaveLeadIcebreakInput {
  productId: string
  leadId: string
  icebreak: string
}

/** 只替换已有画像上的破冰与 updatedAt。六段和 status 不动。 */
export function applyIcebreakEdit(
  intelligence: CompanyIntelligence,
  icebreak: string,
  updatedAt: string,
): CompanyIntelligence {
  return {
    ...intelligence,
    icebreak,
    updatedAt,
  }
}

function readIntelligence(value: unknown): CompanyIntelligence | null {
  const row = asRecord(value)
  if (!row) return null
  const status = row.status
  if (status !== 'pending' && status !== 'ready' && status !== 'failed') return null
  const errorMessage = typeof row.errorMessage === 'string' ? row.errorMessage : ''
  const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : ''
  return {
    businessModel: asText(row.businessModel),
    productsBrands: asText(row.productsBrands),
    targetMarket: asText(row.targetMarket),
    supplyChain: asText(row.supplyChain),
    industryPosition: asText(row.industryPosition),
    collabOpportunity: asText(row.collabOpportunity),
    icebreak: asText(row.icebreak),
    status,
    ...(errorMessage ? { errorMessage } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeDomain(url: string): string | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const hostname = new URL(raw).hostname.toLowerCase()
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname
  } catch {
    return null
  }
}

function dedupeKeyOfRaw(row: Record<string, unknown>): string {
  const company = asRecord(row.company) ?? {}
  const source = asRecord(row.source) ?? {}
  const domain = normalizeDomain(cleanString(company.website) || cleanString(source.url))
  if (domain) return domain
  const name = cleanString(company.name).toLowerCase()
  if (name) return name
  return cleanString(row.id)
}

function findRawLeadLine(
  productId: string,
  leadId: string,
  workspaceRoot: string,
): { filePath: string; lines: string[]; index: number; row: Record<string, unknown> } | null {
  const dir = getRawLeadsDir(productId, workspaceRoot)
  if (!fs.existsSync(dir)) return null
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
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i]!.trim()
      if (!trimmed) continue
      try {
        const row = asRecord(JSON.parse(trimmed))
        if (row && cleanString(row.id) === leadId) {
          return { filePath, lines, index: i, row }
        }
      } catch {
        // skip bad line
      }
    }
  }
  return null
}

/**
 * 只改已有 companyIntelligence 的 icebreak 与 updatedAt。
 * 同一 id 的 raw 与 scored 一起改；同 dedupe_key 的其它 scored 行也写同一句破冰。
 */
export function saveLeadIcebreak(
  input: SaveLeadIcebreakInput,
  workspaceRoot = getWorkspaceRoot(),
): RawLeadSaveResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  if (!productId) {
    return { ok: false, message: '缺少 productId' }
  }
  if (!leadId) {
    return { ok: false, message: '缺少 leadId' }
  }

  const rawHit = findRawLeadLine(productId, leadId, workspaceRoot)
  const scoredPath = getScoredLeadsPath(productId, workspaceRoot)
  let scoredRoot: Record<string, unknown> | null = null
  let scoredLeads: Record<string, unknown>[] = []
  if (fs.existsSync(scoredPath)) {
    try {
      scoredRoot = asRecord(JSON.parse(fs.readFileSync(scoredPath, 'utf8')))
      const leads = scoredRoot && Array.isArray(scoredRoot.leads) ? scoredRoot.leads : []
      scoredLeads = leads.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    } catch {
      scoredRoot = null
      scoredLeads = []
    }
  }
  const scoredRow = scoredLeads.find((lead) => cleanString(lead.id) === leadId) ?? null
  if (!rawHit && !scoredRow) {
    return { ok: false, message: '未找到线索' }
  }

  const primary = scoredRow ?? rawHit?.row
  if (!primary || !Object.prototype.hasOwnProperty.call(primary, 'companyIntelligence') || primary.companyIntelligence == null) {
    return { ok: false, message: '这条线索还没有目标公司画像' }
  }
  const intel = readIntelligence(primary.companyIntelligence)
  if (!intel || intel.status === 'pending') {
    return { ok: false, message: '画像状态异常，暂不能改破冰' }
  }
  if (intel.status === 'failed' && intel.icebreak.trim().length === 0) {
    return { ok: false, message: '这条线索没有可保存的破冰' }
  }
  const icebreak = cleanString(input.icebreak)
  if (!icebreak) {
    return { ok: false, message: '破冰不能为空' }
  }

  const updatedAt = new Date().toISOString()
  const dedupeKey = scoredRow
    ? cleanString(scoredRow.dedupe_key) || (rawHit ? dedupeKeyOfRaw(rawHit.row) : '')
    : rawHit
      ? dedupeKeyOfRaw(rawHit.row)
      : ''

  if (rawHit) {
    const rawIntel = readIntelligence(rawHit.row.companyIntelligence)
    if (rawIntel) {
      rawHit.row.companyIntelligence = applyIcebreakEdit(rawIntel, icebreak, updatedAt)
      const rewritten: string[] = []
      for (let i = 0; i < rawHit.lines.length; i += 1) {
        const trimmed = rawHit.lines[i]!.trim()
        if (!trimmed) continue
        if (i === rawHit.index) {
          rewritten.push(JSON.stringify(rawHit.row))
          continue
        }
        try {
          JSON.parse(trimmed)
          rewritten.push(trimmed)
        } catch {
          // drop invalid
        }
      }
      fs.writeFileSync(rawHit.filePath, `${rewritten.join('\n')}\n`, 'utf8')
    }
  }

  if (scoredRoot) {
    let changed = false
    for (const lead of scoredLeads) {
      const sameId = cleanString(lead.id) === leadId
      const sameKey = Boolean(dedupeKey) && cleanString(lead.dedupe_key) === dedupeKey
      if (!sameId && !sameKey) continue
      const rowIntel = readIntelligence(lead.companyIntelligence)
      if (!rowIntel) continue
      lead.companyIntelligence = applyIcebreakEdit(rowIntel, icebreak, updatedAt)
      changed = true
    }
    if (changed) {
      scoredRoot.leads = scoredLeads
      scoredRoot.updated_at = updatedAt
      fs.writeFileSync(scoredPath, `${JSON.stringify(scoredRoot, null, 2)}\n`, 'utf8')
    }
  }

  const snapshot = listLeadsSnapshot(productId, workspaceRoot)
  const lead = snapshot.rows.find((row) => row.id === leadId)
  return {
    ok: true,
    message: '已保存破冰',
    lead,
  }
}
