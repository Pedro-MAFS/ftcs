import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import {
  listLeadsSnapshot,
  type LeadPersonSource,
  type LeadRow,
} from './leads-reader'
import {
  comparePersons,
  manualSourceRecord,
} from './person-helpers'

export interface SaveScoredPeoplePersonInput {
  id?: string
  name: string
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  roleMatch?: string | null
  matchReason?: string
  email: string
  emailStatus?: string
  confidence?: number
  provider?: 'hunter' | 'manual'
  sources?: LeadPersonSource[]
  enrichedAt?: string
}

export interface SaveScoredPeopleInput {
  productId: string
  leadId: string
  people: SaveScoredPeoplePersonInput[]
}

export interface SaveScoredPeopleResult {
  ok: boolean
  message: string
  lead?: LeadRow
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getScoredPath(productId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'scored.json')
}

function formatDatePart(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function collectPersonSeqs(
  leads: unknown[],
  prefix: string,
): number[] {
  const seqs: number[] = []
  for (const item of leads) {
    const lead = asRecord(item)
    if (!lead || !Array.isArray(lead.people)) continue
    for (const p of lead.people) {
      const person = asRecord(p)
      const id = String(person?.id || '')
      if (!id.startsWith(prefix)) continue
      const seq = Number.parseInt(id.slice(prefix.length), 10)
      if (Number.isFinite(seq)) seqs.push(seq)
    }
  }
  return seqs
}

function createAllocator(leads: unknown[], date = new Date()): () => string {
  const prefix = `person_${formatDatePart(date)}_`
  const seqs = collectPersonSeqs(leads, prefix)
  let next = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1
  return () => {
    const id = `${prefix}${String(next).padStart(4, '0')}`
    next += 1
    return id
  }
}

function sourcesToDisk(
  sources: LeadPersonSource[] | undefined,
): Array<Record<string, unknown>> {
  if (!sources || sources.length === 0) return []
  return sources
    .filter((s) => s.uri?.trim())
    .map((s) => ({
      domain: s.domain || '',
      uri: s.uri,
      extracted_on: s.extractedOn || manualSourceRecord().extracted_on,
      last_seen_on: s.lastSeenOn || manualSourceRecord().last_seen_on,
      still_on_page: Boolean(s.stillOnPage),
    }))
}

/**
 * scored 线索 people 全量写回（US-C-04）。
 */
export function saveScoredPeople(
  input: SaveScoredPeopleInput,
  workspaceRoot = getWorkspaceRoot(),
): SaveScoredPeopleResult {
  const productId = (input.productId || '').trim()
  const leadId = (input.leadId || '').trim()
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  const scoredPath = getScoredPath(productId, workspaceRoot)
  if (!fs.existsSync(scoredPath)) {
    return { ok: false, message: `未找到 scored.json：${productId}` }
  }

  let root: Record<string, unknown>
  try {
    root = JSON.parse(fs.readFileSync(scoredPath, 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return { ok: false, message: 'scored.json 解析失败' }
  }

  const leads = Array.isArray(root.leads) ? [...root.leads] : []
  const leadIndex = leads.findIndex((item) => {
    const row = asRecord(item)
    return row && String(row.id || '') === leadId
  })
  if (leadIndex < 0) {
    return { ok: false, message: `未找到线索 ${leadId}` }
  }

  const lead = asRecord(leads[leadIndex])!
  const existingPeople = Array.isArray(lead.people) ? lead.people : []
  const existingById = new Map<string, Record<string, unknown>>()
  for (const item of existingPeople) {
    const p = asRecord(item)
    if (p?.id) existingById.set(String(p.id), p)
  }

  const seenEmails = new Set<string>()
  const nextId = createAllocator(leads)
  const now = new Date().toISOString()
  const normalized: Record<string, unknown>[] = []

  for (const raw of input.people ?? []) {
    const email = (raw.email || '').trim()
    if (!email) {
      return { ok: false, message: '邮箱不能为空' }
    }
    const emailKey = email.toLowerCase()
    if (seenEmails.has(emailKey)) {
      return { ok: false, message: `重复邮箱：${email}` }
    }
    seenEmails.add(emailKey)

    const name =
      (raw.name || '').trim() || email.split('@')[0] || 'unknown'
    const existing = raw.id ? existingById.get(raw.id) : undefined
    let provider: 'hunter' | 'manual' =
      raw.provider === 'hunter' || raw.provider === 'manual'
        ? raw.provider
        : existing && String(existing.provider) === 'hunter'
          ? 'hunter'
          : 'manual'

    let sources = sourcesToDisk(raw.sources)
    if (provider === 'manual' && sources.length === 0) {
      sources = [manualSourceRecord()]
    }
    if (provider === 'hunter' && sources.length === 0 && existing) {
      const prev = Array.isArray(existing.sources)
        ? (existing.sources as Record<string, unknown>[])
        : []
      sources = prev.length > 0 ? prev : [manualSourceRecord()]
      if (sources[0]?.domain === 'manual') provider = 'manual'
    }
    if (sources.length === 0) {
      sources = [manualSourceRecord()]
      provider = 'manual'
    }

    const emailStatus =
      (raw.emailStatus || '').trim() ||
      (existing ? String(existing.email_status || '') : '') ||
      'hunter_unverified'
    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
        : existing && typeof existing.confidence === 'number'
          ? Number(existing.confidence)
          : 0

    normalized.push({
      id: raw.id && existingById.has(raw.id) ? raw.id : nextId(),
      name,
      first_name: raw.firstName ?? null,
      last_name: raw.lastName ?? null,
      title: raw.title ?? null,
      role_match: raw.roleMatch ?? null,
      match_reason:
        (raw.matchReason || '').trim() ||
        (provider === 'manual' ? '用户手工录入' : '用户编辑'),
      email,
      email_status: emailStatus,
      confidence,
      sources,
      provider,
      enriched_at:
        existing && typeof existing.enriched_at === 'string'
          ? existing.enriched_at
          : raw.enrichedAt || now,
    })
  }

  normalized.sort((a, b) =>
    comparePersons(
      {
        email: String(a.email),
        confidence: Number(a.confidence) || 0,
        title: (a.title as string | null) ?? null,
        first_name: (a.first_name as string | null) ?? null,
      },
      {
        email: String(b.email),
        confidence: Number(b.confidence) || 0,
        title: (b.title as string | null) ?? null,
        first_name: (b.first_name as string | null) ?? null,
      },
    ),
  )

  lead.people = normalized
  leads[leadIndex] = lead
  root.leads = leads
  root.updated_at = now
  fs.writeFileSync(scoredPath, `${JSON.stringify(root, null, 2)}\n`, 'utf8')

  const snapshot = listLeadsSnapshot(productId, workspaceRoot)
  const row = snapshot.rows.find((r) => r.id === leadId)
  return {
    ok: true,
    message: `已保存 ${normalized.length} 位关键联系人`,
    lead: row,
  }
}
