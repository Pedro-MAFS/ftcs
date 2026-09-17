import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import {
  resolveSlotDraftAbsPath,
  resolveSlotDraftRelPath,
} from './emails-reader'

export interface RejectEmailDraftInput {
  productId: string
  leadId: string
}

export interface RejectEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
}

export interface EmailVariantEdit {
  type: 'short' | 'professional'
  subject: string
  body: string
}

export interface ApproveEmailDraftInput {
  productId: string
  leadId: string
  /** 当前选中收件人槽；默认 company */
  recipientKey?: string
  /** 选用的邮件变体；默认 short（过渡兼容） */
  selectedVariant?: 'short' | 'professional'
  /** 可选：一并写入的变体内容（人工改稿，过渡兼容） */
  variants?: EmailVariantEdit[]
  /** 单正文改稿（优先于 variants） */
  subject?: string
  body?: string
}

export interface ApproveEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
}

export interface SaveEmailDraftSlotInput {
  productId: string
  leadId: string
  recipientKey: string
  subject: string
  body: string
}

export interface SaveEmailDraftSlotResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
  draftPath?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBody(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function applyVariantEdits(
  draft: Record<string, unknown>,
  edits: EmailVariantEdit[] | undefined,
): Record<string, unknown> {
  if (!edits || edits.length === 0) return draft

  const existing = Array.isArray(draft.variants) ? draft.variants : []
  const byType = new Map<string, Record<string, unknown>>()
  for (const item of existing) {
    const v = asRecord(item)
    if (!v) continue
    const type = cleanString(v.type)
    if (type) byType.set(type, { ...v })
  }

  for (const edit of edits) {
    const type = edit.type === 'professional' ? 'professional' : 'short'
    const prev = byType.get(type) ?? { type }
    byType.set(type, {
      ...prev,
      type,
      subject: cleanString(edit.subject),
      body: asBody(edit.body),
    })
  }

  const order = ['short', 'professional']
  const nextVariants: Record<string, unknown>[] = []
  for (const type of order) {
    const v = byType.get(type)
    if (v) nextVariants.push(v)
  }
  for (const [type, v] of byType) {
    if (!order.includes(type)) nextVariants.push(v)
  }

  return { ...draft, variants: nextVariants }
}

function getScoredPath(productId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'scored.json')
}

function getEmailLeadDir(leadId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'emails', leadId)
}

function rebuildStats(leads: Record<string, unknown>[]): Record<string, unknown> {
  const byTier: Record<string, number> = { high: 0, medium: 0, low: 0 }
  const byStatus: Record<string, number> = {}
  for (const lead of leads) {
    const tier = cleanString(lead.tier) || 'low'
    byTier[tier] = (byTier[tier] ?? 0) + 1
    const status = cleanString(lead.status) || 'new'
    byStatus[status] = (byStatus[status] ?? 0) + 1
  }
  return {
    total: leads.length,
    by_tier: byTier,
    by_status: byStatus,
  }
}

function updateLeadStatus(
  productId: string,
  leadId: string,
  status: string,
  workspaceRoot: string,
): { ok: boolean; message: string } {
  const scoredPath = getScoredPath(productId, workspaceRoot)
  if (!fs.existsSync(scoredPath)) {
    return { ok: false, message: `未找到 scored.json：${productId}` }
  }

  let root: Record<string, unknown>
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(scoredPath, 'utf8')))
    if (!parsed) return { ok: false, message: 'scored.json 格式无效' }
    root = parsed
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const leads = Array.isArray(root.leads) ? root.leads : []
  let found = false
  const nextLeads: Record<string, unknown>[] = []
  for (const item of leads) {
    const lead = asRecord(item)
    if (!lead) continue
    if (cleanString(lead.id) === leadId) {
      found = true
      nextLeads.push({ ...lead, status })
    } else {
      nextLeads.push(lead)
    }
  }

  if (!found) {
    return {
      ok: false,
      message: `scored.json 中未找到线索 ${leadId}`,
    }
  }

  const next = {
    ...root,
    product_id: cleanString(root.product_id) || productId,
    updated_at: new Date().toISOString(),
    leads: nextLeads,
    stats: rebuildStats(nextLeads),
  }
  fs.writeFileSync(scoredPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true, message: `线索状态已更新为 ${status}` }
}

function getMarkdownPath(
  leadId: string,
  recipientKey: string,
  workspaceRoot: string,
): string {
  const key = recipientKey.trim() || 'company'
  if (key === 'company') {
    return path.join(getEmailLeadDir(leadId, workspaceRoot), 'draft.md')
  }
  return path.join(getEmailLeadDir(leadId, workspaceRoot), key, 'draft.md')
}

function syncApprovedMarkdown(
  draft: Record<string, unknown>,
  leadId: string,
  recipientKey: string,
  workspaceRoot: string,
): void {
  const mdPath = getMarkdownPath(leadId, recipientKey, workspaceRoot)
  const draftPath = resolveSlotDraftAbsPath(leadId, recipientKey, workspaceRoot)
  if (!fs.existsSync(mdPath) && !fs.existsSync(draftPath)) {
    return
  }

  let subject = cleanString(draft.subject)
  let body = asBody(draft.body)
  if (!subject) {
    const variants = Array.isArray(draft.variants) ? draft.variants : []
    const selected = cleanString(draft.selected_variant) || 'professional'
    const chosen =
      variants.find((item) => {
        const v = asRecord(item)
        return v && cleanString(v.type) === selected
      }) ?? asRecord(variants[0])
    subject = chosen ? cleanString(chosen.subject) : ''
    body = chosen ? asBody(chosen.body) : ''
  }

  const review = asRecord(draft.review) ?? {}
  const reviewedAt = cleanString(review.reviewed_at) || new Date().toISOString()

  const md = [
    `# Email Draft · ${leadId}`,
    '',
    `- status: approved`,
    `- audience: ${cleanString(draft.audience) || 'company'}`,
    `- recipient_key: ${recipientKey || 'company'}`,
    `- reviewed_at: ${reviewedAt}`,
    '',
    `## Subject`,
    '',
    subject || '—',
    '',
    `## Body`,
    '',
    body || '—',
    '',
  ].join('\n')

  fs.mkdirSync(path.dirname(mdPath), { recursive: true })
  fs.writeFileSync(mdPath, md, 'utf8')
}

function removeEmailDocuments(
  leadId: string,
  workspaceRoot: string,
): { removed: boolean; path: string } {
  const dir = getEmailLeadDir(leadId, workspaceRoot)
  if (!fs.existsSync(dir)) {
    return { removed: false, path: dir }
  }
  fs.rmSync(dir, { recursive: true, force: true })
  return { removed: true, path: dir }
}

/**
 * 驳回邮件草稿：线索 status → new，并删除 data/emails/{lead_id}/ 下全部文件。
 * 与画像修改一致：桌面主进程直接写盘，不经 MCP。
 */
export function rejectEmailDraft(
  input: RejectEmailDraftInput,
  workspaceRoot = getWorkspaceRoot(),
): RejectEmailDraftResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  const emailDir = getEmailLeadDir(leadId, workspaceRoot)
  const hasEmailDir = fs.existsSync(emailDir)

  const statusResult = updateLeadStatus(productId, leadId, 'new', workspaceRoot)
  if (!statusResult.ok) {
    if (hasEmailDir) {
      removeEmailDocuments(leadId, workspaceRoot)
      return {
        ok: false,
        message: `${statusResult.message}；已尝试删除邮件目录`,
        productId,
        leadId,
      }
    }
    return { ok: false, message: statusResult.message, productId, leadId }
  }

  const removed = removeEmailDocuments(leadId, workspaceRoot)
  const parts = ['已驳回：线索状态回退为 new']
  if (removed.removed) {
    parts.push(`已删除 data/emails/${leadId}/（整条线索全部开发信）`)
  } else if (!hasEmailDir) {
    parts.push('未找到邮件目录（可能已删除）')
  }

  return {
    ok: true,
    message: parts.join('；'),
    productId,
    leadId,
  }
}

/**
 * 按槽保存编辑：不改审批状态。
 */
export function saveEmailDraftSlot(
  input: SaveEmailDraftSlotInput,
  workspaceRoot = getWorkspaceRoot(),
): SaveEmailDraftSlotResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  const recipientKey = cleanString(input.recipientKey) || 'company'
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  const draftPath = resolveSlotDraftAbsPath(leadId, recipientKey, workspaceRoot)
  if (!fs.existsSync(draftPath)) {
    return {
      ok: false,
      message: `未找到草稿：${resolveSlotDraftRelPath(leadId, recipientKey)}`,
      productId,
      leadId,
      recipientKey,
    }
  }

  let draft: Record<string, unknown>
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(draftPath, 'utf8')))
    if (!parsed) {
      return { ok: false, message: 'draft.json 格式无效', productId, leadId, recipientKey }
    }
    draft = parsed
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      productId,
      leadId,
      recipientKey,
    }
  }

  const draftProductId = cleanString(draft.product_id)
  if (draftProductId && draftProductId !== productId) {
    return {
      ok: false,
      message: `草稿属于 ${draftProductId}，与当前产品 ${productId} 不一致`,
      productId,
      leadId,
      recipientKey,
    }
  }

  const subject = cleanString(input.subject)
  const body = asBody(input.body)
  if (!subject) {
    return { ok: false, message: '主题不能为空', productId, leadId, recipientKey }
  }

  const now = new Date().toISOString()
  const nextDraft: Record<string, unknown> = {
    ...draft,
    product_id: draftProductId || productId,
    lead_id: cleanString(draft.lead_id) || leadId,
    updated_at: now,
    subject,
    body,
    status: cleanString(draft.status) || 'pending_review',
  }

  fs.writeFileSync(draftPath, `${JSON.stringify(nextDraft, null, 2)}\n`, 'utf8')
  return {
    ok: true,
    message: '已保存当前收件人草稿',
    productId,
    leadId,
    recipientKey,
    draftPath: resolveSlotDraftRelPath(leadId, recipientKey),
  }
}

/**
 * 通过并保存：当前槽 draft → approved，线索 → email_approved；不发送。
 */
export function approveEmailDraft(
  input: ApproveEmailDraftInput,
  workspaceRoot = getWorkspaceRoot(),
): ApproveEmailDraftResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  const recipientKey = cleanString(input.recipientKey) || 'company'
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  const draftPath = resolveSlotDraftAbsPath(leadId, recipientKey, workspaceRoot)
  if (!fs.existsSync(draftPath)) {
    return {
      ok: false,
      message: `未找到草稿：${resolveSlotDraftRelPath(leadId, recipientKey)}`,
      productId,
      leadId,
      recipientKey,
    }
  }

  let draft: Record<string, unknown>
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(draftPath, 'utf8')))
    if (!parsed) {
      return { ok: false, message: 'draft.json 格式无效', productId, leadId, recipientKey }
    }
    draft = parsed
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      productId,
      leadId,
      recipientKey,
    }
  }

  const draftProductId = cleanString(draft.product_id)
  if (draftProductId && draftProductId !== productId) {
    return {
      ok: false,
      message: `草稿属于 ${draftProductId}，与当前产品 ${productId} 不一致`,
      productId,
      leadId,
      recipientKey,
    }
  }

  let subject = cleanString(input.subject) || cleanString(draft.subject)
  let body =
    typeof input.body === 'string' ? input.body : asBody(draft.body)

  if (!subject && input.variants && input.variants.length > 0) {
    const preferred =
      input.variants.find((v) => v.type === 'professional') ??
      input.variants.find(
        (v) =>
          v.type === (input.selectedVariant === 'short' ? 'short' : 'professional'),
      ) ??
      input.variants[0]
    if (preferred) {
      subject = cleanString(preferred.subject)
      body = asBody(preferred.body)
    }
  } else if (!subject) {
    draft = applyVariantEdits(draft, undefined)
    const variants = Array.isArray(draft.variants) ? draft.variants : []
    const pro = variants.find((item) => {
      const v = asRecord(item)
      return v && cleanString(v.type) === 'professional'
    })
    const first = asRecord(variants[0])
    const chosen = asRecord(pro) ?? first
    if (chosen) {
      subject = cleanString(chosen.subject)
      body = asBody(chosen.body)
    }
  }

  if (!subject) {
    return {
      ok: false,
      message: '草稿缺少 subject，无法保存',
      productId,
      leadId,
      recipientKey,
    }
  }

  const reviewedAt = new Date().toISOString()
  const recipient = asRecord(draft.recipient) ?? {}
  const nextDraft: Record<string, unknown> = {
    id: cleanString(draft.id) || leadId,
    lead_id: cleanString(draft.lead_id) || leadId,
    product_id: draftProductId || productId,
    created_at: cleanString(draft.created_at) || reviewedAt,
    updated_at: reviewedAt,
    status: 'approved',
    language: cleanString(draft.language) || 'en',
    audience:
      draft.audience === 'person' || recipientKey !== 'company'
        ? 'person'
        : 'company',
    recipient: {
      company: cleanString(recipient.company) || undefined,
      email: cleanString(recipient.email) || undefined,
      name: recipient.name === null ? null : cleanString(recipient.name) || undefined,
      recipient_aliases: Array.isArray(recipient.recipient_aliases)
        ? recipient.recipient_aliases
        : undefined,
    },
    subject,
    body,
    subject_zh: draft.subject_zh ?? null,
    body_zh: draft.body_zh ?? null,
    style_prompt: draft.style_prompt ?? null,
    personalization_evidence: Array.isArray(draft.personalization_evidence)
      ? draft.personalization_evidence
      : [],
    review: {
      approved: true,
      reviewer_notes: asRecord(draft.review)?.reviewer_notes ?? null,
      reviewed_at: reviewedAt,
    },
  }

  fs.writeFileSync(draftPath, `${JSON.stringify(nextDraft, null, 2)}\n`, 'utf8')
  syncApprovedMarkdown(nextDraft, leadId, recipientKey, workspaceRoot)

  const statusResult = updateLeadStatus(
    productId,
    leadId,
    'email_approved',
    workspaceRoot,
  )
  if (!statusResult.ok) {
    return {
      ok: false,
      message: `草稿已标记 approved，但线索状态更新失败：${statusResult.message}`,
      productId,
      leadId,
      recipientKey,
    }
  }

  return {
    ok: true,
    message: '已通过并保存当前收件人草稿，线索状态 → email_approved',
    productId,
    leadId,
    recipientKey,
  }
}
