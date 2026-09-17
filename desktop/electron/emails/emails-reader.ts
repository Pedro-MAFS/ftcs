import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { getWorkspaceRoot } from '../config/paths'

export interface EmailVariantRow {
  type: string
  subject: string
  body: string
}

export interface EmailDraftSlotRow {
  slotKind: 'company' | 'person'
  recipientKey: string
  email: string
  name: string
  audience: 'company' | 'person'
  status: string
  subject: string
  draftPath: string
  hasZh: boolean
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
  body: string
  audience: 'company' | 'person'
  hasCompanyDraft: boolean
  personDraftCount: number
  draftCount: number
  subjectZh: string | null
  bodyZh: string | null
  stylePrompt: string | null
  recipientAliases: string[]
  slots: EmailDraftSlotRow[]
  /** @deprecated 过渡兼容 EmailView；恒为 professional 单元素 */
  selectedVariant: string
  /** @deprecated 过渡兼容 */
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
    totalDraftFiles: number
  }
}

export type EmailDraftsArtifact = {
  productId: string
  generatedLeadIds: string[]
  total: number
  newestCreatedAt: string
}

const COMPANY_KEY = 'company'

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

function getCompanyDraftPath(leadId: string, workspaceRoot = getWorkspaceRoot()): string {
  return path.join(getEmailsDir(workspaceRoot), leadId, 'draft.json')
}

function getCompanyMarkdownPath(leadId: string, workspaceRoot = getWorkspaceRoot()): string {
  return path.join(getEmailsDir(workspaceRoot), leadId, 'draft.md')
}

function normalizeEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return null
  return normalized
}

function sha(value: string, len: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, len)
}

/** 与 lead-store email-recipient-key 对齐 */
export function recipientKeyFromEmail(raw: string): string | null {
  const normalized = normalizeEmail(raw)
  if (!normalized) return null

  let slug = normalized
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._+-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!slug || slug === COMPANY_KEY) {
    return `p_${sha(normalized, 16)}`
  }
  if (slug.length > 80) {
    slug = `${slug.slice(0, 64).replace(/_+$/g, '')}_${sha(normalized, 8)}`
  }
  return slug
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
  return fs.existsSync(getCompanyDraftPath(leadId, workspaceRoot))
}

/** 已评分且尚无公司向 draft.json 的线索 id（按分数高→低；不限 tier） */
export function listLeadsNeedingDraft(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string[] {
  const scored = [...loadScoredLeadMap(productId, workspaceRoot).values()]
  return scored
    .filter((lead) => !draftExists(lead.id, workspaceRoot))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((lead) => lead.id)
}

/** @deprecated 使用 listLeadsNeedingDraft；保留别名避免外部引用断裂 */
export const listHighLeadsNeedingDraft = listLeadsNeedingDraft

function needsMigration(raw: Record<string, unknown>): boolean {
  const hasVariants = Array.isArray(raw.variants) && raw.variants.length > 0
  const hasAudience = raw.audience === 'company' || raw.audience === 'person'
  const subject = asString(raw.subject).trim()
  const body = asString(raw.body)
  const hasBodyPair = subject.length > 0 && body.length > 0
  if (hasVariants) return true
  if ('selected_variant' in raw) return true
  if (!hasAudience) return true
  if (!hasBodyPair) return true
  return false
}

function pickBody(raw: Record<string, unknown>): { subject: string; body: string } | null {
  const topSubject = asString(raw.subject).trim()
  const topBody = asString(raw.body)
  if (topSubject && topBody.length > 0) return { subject: topSubject, body: topBody }

  const variants = Array.isArray(raw.variants) ? raw.variants : []
  let chosen: Record<string, unknown> | null = null
  for (const item of variants) {
    const v = asRecord(item)
    if (v && asString(v.type) === 'professional') {
      chosen = v
      break
    }
  }
  if (!chosen && variants.length > 0) chosen = asRecord(variants[0])
  if (!chosen) return null
  return { subject: asString(chosen.subject).trim(), body: asString(chosen.body) }
}

function migrateDraftFile(
  filePath: string,
  pathHint: 'company' | 'person',
): Record<string, unknown> | null {
  try {
    const raw = asRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    if (!raw) return null
    if (!needsMigration(raw)) return raw

    const picked = pickBody(raw)
    if (!picked) return null

    // 迁移前旁路备份（幂等：已有 .pre-m01 不覆盖）
    const backupPath = `${filePath}.pre-m01`
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath)
      const mdPath = path.join(path.dirname(filePath), 'draft.md')
      const mdBackup = `${mdPath}.pre-m01`
      if (fs.existsSync(mdPath) && !fs.existsSync(mdBackup)) {
        fs.copyFileSync(mdPath, mdBackup)
      }
    }

    const now = new Date().toISOString()
    let audience: 'company' | 'person' =
      raw.audience === 'person' || raw.audience === 'company'
        ? raw.audience
        : pathHint
    if (pathHint === 'company') audience = 'company'

    const recipient = asRecord(raw.recipient) ?? {}
    const review = asRecord(raw.review) ?? {}
    const evidence = Array.isArray(raw.personalization_evidence)
      ? raw.personalization_evidence.map(String)
      : []

    const next: Record<string, unknown> = {
      id: asString(raw.id) || asString(raw.lead_id),
      lead_id: asString(raw.lead_id),
      product_id: asString(raw.product_id),
      created_at: asString(raw.created_at) || now,
      updated_at: now,
      status: asString(raw.status) || 'pending_review',
      language: asString(raw.language) || 'en',
      audience,
      recipient: {
        company: asString(recipient.company) || undefined,
        email: asString(recipient.email).trim().toLowerCase() || undefined,
        name: recipient.name === null ? null : asString(recipient.name) || undefined,
      },
      subject: picked.subject,
      body: picked.body,
      subject_zh: raw.subject_zh ?? null,
      body_zh: raw.body_zh ?? null,
      style_prompt: raw.style_prompt ?? null,
      personalization_evidence: evidence,
      review: {
        approved: typeof review.approved === 'boolean' ? review.approved : null,
        reviewer_notes:
          review.reviewer_notes === null || typeof review.reviewer_notes === 'string'
            ? review.reviewer_notes
            : null,
        reviewed_at:
          review.reviewed_at === null || typeof review.reviewed_at === 'string'
            ? review.reviewed_at
            : null,
      },
    }

    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, filePath)

    const mdPath = path.join(path.dirname(filePath), 'draft.md')
    if (fs.existsSync(mdPath)) {
      const lines = [
        `# Email Draft: ${asString((next.recipient as Record<string, unknown>)?.company) || asString(next.lead_id)}`,
        '',
        `## Subject`,
        '',
        asString(next.subject),
        '',
        `## Body`,
        '',
        asString(next.body),
        '',
      ]
      fs.writeFileSync(mdPath, `${lines.join('\n').trim()}\n`, 'utf8')
    }

    return next
  } catch {
    return null
  }
}

function migrateAllEmailDrafts(workspaceRoot: string): void {
  const emailsDir = getEmailsDir(workspaceRoot)
  if (!fs.existsSync(emailsDir)) return
  for (const name of fs.readdirSync(emailsDir)) {
    const leadDir = path.join(emailsDir, name)
    if (!fs.statSync(leadDir).isDirectory()) continue
    const companyPath = path.join(leadDir, 'draft.json')
    if (fs.existsSync(companyPath)) migrateDraftFile(companyPath, 'company')
    for (const child of fs.readdirSync(leadDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const personPath = path.join(leadDir, child.name, 'draft.json')
      if (fs.existsSync(personPath)) migrateDraftFile(personPath, 'person')
    }
  }
}

function parseSlotFile(
  filePath: string,
  pathHint: 'company' | 'person',
  recipientKey: string,
): {
  raw: Record<string, unknown>
  subject: string
  body: string
  status: string
  audience: 'company' | 'person'
  email: string
  name: string
  hasZh: boolean
  createdAt: string
} | null {
  const raw = migrateDraftFile(filePath, pathHint)
  if (!raw) return null
  const recipient = asRecord(raw.recipient) ?? {}
  const subject = asString(raw.subject)
  const body = asString(raw.body)
  return {
    raw,
    subject,
    body,
    status: asString(raw.status) || 'pending_review',
    audience: pathHint === 'company' ? 'company' : 'person',
    email: asString(recipient.email),
    name: asString(recipient.name),
    hasZh: Boolean(asString(raw.subject_zh) || asString(raw.body_zh)),
    createdAt: asString(raw.created_at),
  }
}

function pickAggregateStatus(statuses: string[]): string {
  if (statuses.some((s) => s === 'pending_review')) return 'pending_review'
  if (statuses.some((s) => s === 'approved')) return 'approved'
  if (statuses.some((s) => s === 'rejected')) return 'rejected'
  return 'pending_review'
}

function buildLeadRow(
  leadId: string,
  scored: Map<string, ScoredLeadLite>,
  workspaceRoot: string,
  productId: string,
): EmailDraftRow | null {
  const leadDir = path.join(getEmailsDir(workspaceRoot), leadId)
  if (!fs.existsSync(leadDir)) return null

  const slots: EmailDraftSlotDto[] = []
  const companyPath = path.join(leadDir, 'draft.json')
  let companyParsed: ReturnType<typeof parseSlotFile> = null
  if (fs.existsSync(companyPath)) {
    companyParsed = parseSlotFile(companyPath, 'company', COMPANY_KEY)
    if (companyParsed) {
      slots.push({
        slotKind: 'company',
        recipientKey: COMPANY_KEY,
        email: companyParsed.email,
        name: companyParsed.name,
        audience: 'company',
        status: companyParsed.status,
        subject: companyParsed.subject,
        draftPath: `data/emails/${leadId}/draft.json`,
        hasZh: companyParsed.hasZh,
      })
    }
  }

  for (const child of fs.readdirSync(leadDir, { withFileTypes: true })) {
    if (!child.isDirectory()) continue
    const personPath = path.join(leadDir, child.name, 'draft.json')
    if (!fs.existsSync(personPath)) continue
    const parsed = parseSlotFile(personPath, 'person', child.name)
    if (!parsed) continue
    slots.push({
      slotKind: 'person',
      recipientKey: child.name,
      email: parsed.email,
      name: parsed.name,
      audience: 'person',
      status: parsed.status,
      subject: parsed.subject,
      draftPath: `data/emails/${leadId}/${child.name}/draft.json`,
      hasZh: parsed.hasZh,
    })
  }

  if (slots.length === 0) return null

  const representativeSlot = slots.find((s) => s.slotKind === 'company') ?? slots[0]!
  const representativeRaw =
    representativeSlot.slotKind === 'company'
      ? companyParsed?.raw
      : parseSlotFile(
          path.join(leadDir, representativeSlot.recipientKey, 'draft.json'),
          'person',
          representativeSlot.recipientKey,
        )?.raw

  if (!representativeRaw) return null

  const draftProductId = asString(representativeRaw.product_id)
  if (draftProductId && draftProductId !== productId) return null
  const scoredLead = scored.get(leadId)
  if (!draftProductId && !scoredLead) return null

  const recipient = asRecord(representativeRaw.recipient) ?? {}
  const subject = asString(representativeRaw.subject)
  const body = asString(representativeRaw.body)
  const evidence = Array.isArray(representativeRaw.personalization_evidence)
    ? representativeRaw.personalization_evidence.map(String)
    : []
  const aliases = Array.isArray(recipient.recipient_aliases)
    ? recipient.recipient_aliases.map(String)
    : []

  return {
    id: asString(representativeRaw.id) || leadId,
    leadId,
    productId: draftProductId || productId,
    createdAt: asString(representativeRaw.created_at),
    status: pickAggregateStatus(slots.map((s) => s.status)),
    language: asString(representativeRaw.language) || 'en',
    companyName: asString(recipient.company) || scoredLead?.companyName || leadId,
    recipientEmail: asString(recipient.email) || scoredLead?.email || '',
    tier: scoredLead?.tier || '',
    leadStatus: scoredLead?.status || '',
    score: scoredLead?.score ?? null,
    subject,
    body,
    audience: representativeSlot.audience,
    hasCompanyDraft: slots.some((s) => s.slotKind === 'company'),
    personDraftCount: slots.filter((s) => s.slotKind === 'person').length,
    draftCount: slots.length,
    subjectZh: asString(representativeRaw.subject_zh) || null,
    bodyZh: asString(representativeRaw.body_zh) || null,
    stylePrompt: asString(representativeRaw.style_prompt) || null,
    recipientAliases: aliases,
    slots,
    selectedVariant: 'professional',
    variants: [{ type: 'professional', subject, body }],
    personalizationEvidence: evidence,
    draftPath: representativeSlot.draftPath,
    markdownPath: fs.existsSync(getCompanyMarkdownPath(leadId, workspaceRoot))
      ? `data/emails/${leadId}/draft.md`
      : '',
  }
}

export function listEmailDraftsSnapshot(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): EmailDraftsSnapshot {
  migrateAllEmailDrafts(workspaceRoot)

  const scored = loadScoredLeadMap(productId, workspaceRoot)
  const pendingHighLeadIds = listLeadsNeedingDraft(productId, workspaceRoot)
  const emailsDir = getEmailsDir(workspaceRoot)
  const drafts: EmailDraftRow[] = []
  let totalDraftFiles = 0

  if (fs.existsSync(emailsDir)) {
    for (const name of fs.readdirSync(emailsDir)) {
      const row = buildLeadRow(name, scored, workspaceRoot, productId)
      if (!row) continue
      drafts.push(row)
      totalDraftFiles += row.draftCount
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
      totalDraftFiles,
    },
  }
}

/** Agent 结束后校验：指定 leadIds 的公司向草稿已存在且 createdAt >= afterIso（若有） */
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

  let matched = snapshot.drafts.filter((d) => d.hasCompanyDraft)
  if (wanted.length > 0) {
    const set = new Set(wanted)
    matched = matched.filter((d) => set.has(d.leadId))
  }
  if (afterIso) {
    matched = matched.filter((d) => d.createdAt && d.createdAt >= afterIso)
  }

  if (wanted.length > 0) {
    const found = new Set(matched.map((d) => d.leadId))
    const allFound = wanted.every((id) => found.has(id) || draftExists(id, workspaceRoot))
    const existingAll = wanted.every((id) => draftExists(id, workspaceRoot))
    if (!allFound && !existingAll) return null
    if (matched.length === 0 && existingAll) {
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
