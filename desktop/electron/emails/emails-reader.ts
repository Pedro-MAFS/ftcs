import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

export interface EmailVariantRow {
  type: string
  subject: string
  body: string
}

export interface EmailDraftRow {
  id: string
  leadId: string
  productId: string
  createdAt: string
  status: string
  language: string
  companyName: string
  recipientEmail: string
  tier: string
  leadStatus: string
  score: number | null
  subject: string
  variants: EmailVariantRow[]
  personalizationEvidence: string[]
  draftPath: string
  markdownPath: string
}

export interface EmailDraftsSnapshot {
  productId: string
  drafts: EmailDraftRow[]
  pendingHighLeadIds: string[]
  stats: {
    total: number
    pendingReview: number
    pendingHigh: number
  }
}

export type EmailDraftsArtifact = {
  productId: string
  generatedLeadIds: string[]
  total: number
  newestCreatedAt: string
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

function getEmailsDir(workspaceRoot = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, 'data', 'emails')
}

function getScoredPath(productId: string, workspaceRoot = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'scored.json')
}

function getDraftPath(leadId: string, workspaceRoot = getWorkspaceRoot()): string {
  return path.join(getEmailsDir(workspaceRoot), leadId, 'draft.json')
}

function getMarkdownPath(leadId: string, workspaceRoot = getWorkspaceRoot()): string {
  return path.join(getEmailsDir(workspaceRoot), leadId, 'draft.md')
}

type ScoredLeadLite = {
  id: string
  companyName: string
  tier: string
  status: string
  score: number | null
  email: string
}

function loadScoredLeadMap(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): Map<string, ScoredLeadLite> {
  const map = new Map<string, ScoredLeadLite>()
  const filePath = getScoredPath(productId, workspaceRoot)
  if (!fs.existsSync(filePath)) return map

  try {
    const root = asRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    if (!root) return map
    const leads = Array.isArray(root.leads) ? root.leads : []
    for (const item of leads) {
      const raw = asRecord(item)
      if (!raw) continue
      const id = asString(raw.id)
      if (!id) continue
      const company = asRecord(raw.company) ?? {}
      const contacts = Array.isArray(raw.contacts) ? raw.contacts : []
      let email = ''
      for (const c of contacts) {
        const contact = asRecord(c)
        if (!contact) continue
        if (asString(contact.type) === 'email' && asString(contact.value)) {
          email = asString(contact.value)
          break
        }
      }
      map.set(id, {
        id,
        companyName: asString(company.name) || id,
        tier: asString(raw.tier),
        status: asString(raw.status) || 'new',
        score: asNumber(raw.score),
        email,
      })
    }
  } catch {
    // ignore
  }
  return map
}

function draftExists(leadId: string, workspaceRoot = getWorkspaceRoot()): boolean {
  return fs.existsSync(getDraftPath(leadId, workspaceRoot))
}

/** high 且尚无 draft.json 的线索 id（按分数高→低） */
export function listHighLeadsNeedingDraft(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string[] {
  const scored = [...loadScoredLeadMap(productId, workspaceRoot).values()]
  return scored
    .filter((lead) => lead.tier === 'high' && !draftExists(lead.id, workspaceRoot))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((lead) => lead.id)
}

function parseDraftFile(
  filePath: string,
  scored: Map<string, ScoredLeadLite>,
  workspaceRoot: string,
): EmailDraftRow | null {
  try {
    const root = asRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    if (!root) return null
    const leadId = asString(root.lead_id)
    if (!leadId) return null
    const variantsRaw = Array.isArray(root.variants) ? root.variants : []
    const variants: EmailVariantRow[] = []
    for (const item of variantsRaw) {
      const v = asRecord(item)
      if (!v) continue
      variants.push({
        type: asString(v.type),
        subject: asString(v.subject),
        body: asString(v.body),
      })
    }
    const short =
      variants.find((v) => v.type === 'short') ?? variants[0] ?? {
        type: '',
        subject: '',
        body: '',
      }
    const recipient = asRecord(root.recipient) ?? {}
    const scoredLead = scored.get(leadId)
    const evidence = Array.isArray(root.personalization_evidence)
      ? root.personalization_evidence.map(String)
      : []

    return {
      id: asString(root.id) || leadId,
      leadId,
      productId: asString(root.product_id),
      createdAt: asString(root.created_at),
      status: asString(root.status) || 'pending_review',
      language: asString(root.language) || 'en',
      companyName:
        asString(recipient.company) || scoredLead?.companyName || leadId,
      recipientEmail: asString(recipient.email) || scoredLead?.email || '',
      tier: scoredLead?.tier || '',
      leadStatus: scoredLead?.status || '',
      score: scoredLead?.score ?? null,
      subject: short.subject,
      variants,
      personalizationEvidence: evidence,
      draftPath: `data/emails/${leadId}/draft.json`,
      markdownPath: fs.existsSync(getMarkdownPath(leadId, workspaceRoot))
        ? `data/emails/${leadId}/draft.md`
        : '',
    }
  } catch {
    return null
  }
}

export function listEmailDraftsSnapshot(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): EmailDraftsSnapshot {
  const scored = loadScoredLeadMap(productId, workspaceRoot)
  const pendingHighLeadIds = listHighLeadsNeedingDraft(productId, workspaceRoot)
  const emailsDir = getEmailsDir(workspaceRoot)
  const drafts: EmailDraftRow[] = []

  if (fs.existsSync(emailsDir)) {
    for (const name of fs.readdirSync(emailsDir)) {
      const draftPath = path.join(emailsDir, name, 'draft.json')
      if (!fs.existsSync(draftPath)) continue
      const row = parseDraftFile(draftPath, scored, workspaceRoot)
      if (!row) continue
      if (row.productId && row.productId !== productId) continue
      // 无 product_id 时：仅当 lead 属于本产品 scored 才纳入
      if (!row.productId && !scored.has(row.leadId)) continue
      if (!row.productId) row.productId = productId
      drafts.push(row)
    }
  }

  drafts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  let pendingReview = 0
  for (const d of drafts) {
    if (d.status === 'pending_review') pendingReview += 1
  }

  return {
    productId,
    drafts,
    pendingHighLeadIds,
    stats: {
      total: drafts.length,
      pendingReview,
      pendingHigh: pendingHighLeadIds.length,
    },
  }
}

/** Agent 结束后校验：指定 leadIds 的草稿已存在且 createdAt >= afterIso（若有） */
export function loadEmailDraftsArtifact(
  productId: string,
  options?: {
    leadIds?: string[]
    afterIso?: string
    workspaceRoot?: string
  },
): EmailDraftsArtifact | null {
  const workspaceRoot = options?.workspaceRoot ?? getWorkspaceRoot()
  const snapshot = listEmailDraftsSnapshot(productId, workspaceRoot)
  const wanted = options?.leadIds?.filter(Boolean) ?? []
  const afterIso = options?.afterIso

  let matched = snapshot.drafts
  if (wanted.length > 0) {
    const set = new Set(wanted)
    matched = matched.filter((d) => set.has(d.leadId))
  }
  if (afterIso) {
    matched = matched.filter((d) => d.createdAt && d.createdAt >= afterIso)
  }

  if (wanted.length > 0) {
    // 单条/指定列表：要求全部命中（覆盖写会更新 created_at）
    const found = new Set(matched.map((d) => d.leadId))
    const allFound = wanted.every((id) => found.has(id) || draftExists(id, workspaceRoot))
    // 覆盖写时 created_at 可能不变；若文件存在也算成功
    const existingAll = wanted.every((id) => draftExists(id, workspaceRoot))
    if (!allFound && !existingAll) return null
    if (matched.length === 0 && existingAll) {
      // 文件存在但 createdAt 未更新：仍视为成功
      return {
        productId,
        generatedLeadIds: wanted,
        total: wanted.length,
        newestCreatedAt: afterIso || new Date().toISOString(),
      }
    }
  } else if (matched.length === 0) {
    return null
  }

  const newest = matched.reduce(
    (acc, d) => ((d.createdAt || '') > acc ? d.createdAt : acc),
    '',
  )

  return {
    productId,
    generatedLeadIds: matched.map((d) => d.leadId),
    total: matched.length || wanted.length,
    newestCreatedAt: newest || afterIso || '',
  }
}
