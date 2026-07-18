import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

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
  /** 选用的邮件变体；默认 short */
  selectedVariant?: 'short' | 'professional'
  /** 可选：一并写入的变体内容（人工改稿） */
  variants?: EmailVariantEdit[]
}

export interface ApproveEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
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

function getDraftPath(leadId: string, workspaceRoot: string): string {
  return path.join(getEmailLeadDir(leadId, workspaceRoot), 'draft.json')
}

function getMarkdownPath(leadId: string, workspaceRoot: string): string {
  return path.join(getEmailLeadDir(leadId, workspaceRoot), 'draft.md')
}

function syncApprovedMarkdown(
  draft: Record<string, unknown>,
  leadId: string,
  workspaceRoot: string,
): void {
  const mdPath = getMarkdownPath(leadId, workspaceRoot)
  if (!fs.existsSync(mdPath) && !fs.existsSync(getDraftPath(leadId, workspaceRoot))) {
    return
  }

  const variants = Array.isArray(draft.variants) ? draft.variants : []
  const selected = cleanString(draft.selected_variant) || 'short'
  const chosen =
    variants.find((item) => {
      const v = asRecord(item)
      return v && cleanString(v.type) === selected
    }) ?? asRecord(variants[0])

  const subject = chosen ? cleanString(chosen.subject) : ''
  const body = chosen ? cleanString(chosen.body) : ''
  const review = asRecord(draft.review) ?? {}
  const reviewedAt = cleanString(review.reviewed_at) || new Date().toISOString()

  const md = [
    `# Email Draft · ${leadId}`,
    '',
    `- status: approved`,
    `- selected_variant: ${selected}`,
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
    // 若仅有邮件目录、scored 无此线索，仍尽量删邮件文件
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
    parts.push(`已删除 data/emails/${leadId}/`)
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
 * 通过并保存：draft → approved，线索 → email_approved；不发送。
 */
export function approveEmailDraft(
  input: ApproveEmailDraftInput,
  workspaceRoot = getWorkspaceRoot(),
): ApproveEmailDraftResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  const draftPath = getDraftPath(leadId, workspaceRoot)
  if (!fs.existsSync(draftPath)) {
    return {
      ok: false,
      message: `未找到草稿：data/emails/${leadId}/draft.json`,
      productId,
      leadId,
    }
  }

  let draft: Record<string, unknown>
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(draftPath, 'utf8')))
    if (!parsed) {
      return { ok: false, message: 'draft.json 格式无效', productId, leadId }
    }
    draft = parsed
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      productId,
      leadId,
    }
  }

  const draftProductId = cleanString(draft.product_id)
  if (draftProductId && draftProductId !== productId) {
    return {
      ok: false,
      message: `草稿属于 ${draftProductId}，与当前产品 ${productId} 不一致`,
      productId,
      leadId,
    }
  }

  const selectedVariant =
    input.selectedVariant === 'professional' ? 'professional' : 'short'
  draft = applyVariantEdits(draft, input.variants)

  const variants = Array.isArray(draft.variants) ? draft.variants : []
  const hasVariant = variants.some((item) => {
    const v = asRecord(item)
    return v && cleanString(v.type) === selectedVariant
  })
  if (!hasVariant) {
    return {
      ok: false,
      message: `草稿中不存在变体 ${selectedVariant}`,
      productId,
      leadId,
    }
  }

  const reviewedAt = new Date().toISOString()
  const nextDraft: Record<string, unknown> = {
    ...draft,
    product_id: draftProductId || productId,
    lead_id: cleanString(draft.lead_id) || leadId,
    status: 'approved',
    selected_variant: selectedVariant,
    review: {
      approved: true,
      reviewer_notes: asRecord(draft.review)?.reviewer_notes ?? null,
      reviewed_at: reviewedAt,
    },
  }

  fs.writeFileSync(draftPath, `${JSON.stringify(nextDraft, null, 2)}\n`, 'utf8')
  syncApprovedMarkdown(nextDraft, leadId, workspaceRoot)

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
    }
  }

  return {
    ok: true,
    message: `已通过并保存：选用 ${selectedVariant}，线索状态 → email_approved`,
    productId,
    leadId,
  }
}
