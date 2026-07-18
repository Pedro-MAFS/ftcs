import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { listLeadsSnapshot, type LeadRow } from './leads-reader'

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
