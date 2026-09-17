import fs from 'node:fs'
import path from 'node:path'

const COMPANY_KEY = 'company'

function resolveSlotDraftAbsPath(
  leadId: string,
  recipientKey: string,
  workspaceRoot: string,
): string {
  const key = recipientKey.trim() || COMPANY_KEY
  if (key === COMPANY_KEY) {
    return path.join(workspaceRoot, 'data', 'emails', leadId, 'draft.json')
  }
  return path.join(workspaceRoot, 'data', 'emails', leadId, key, 'draft.json')
}

function resolveSlotDraftRelPath(leadId: string, recipientKey: string): string {
  const key = recipientKey.trim() || COMPANY_KEY
  if (key === COMPANY_KEY) return `data/emails/${leadId}/draft.json`
  return `data/emails/${leadId}/${key}/draft.json`
}

export interface RejectEmailDraftInput {
  productId: string
  leadId: string
  /** 默认 slot：仅删当前收件人；lead：删整线索全部开发信 */
  scope?: 'slot' | 'lead'
  /** scope=slot 时必填 */
  recipientKey?: string
}

export interface RejectEmailDraftResult {
  ok: boolean
  message: string
  productId?: string
  leadId?: string
  recipientKey?: string
  scope?: 'slot' | 'lead'
  leadStatus?: string
  remainingDraftCount?: number
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
  leadStatus?: string
  remainingDraftCount?: number
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

function readDraftStatus(filePath: string): string | null {
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    if (!parsed) return null
    return cleanString(parsed.status) || 'pending_review'
  } catch {
    return null
  }
}

/** 枚举该 lead 下全部 draft.json 的 status */
export function listLeadDraftStatuses(
  leadId: string,
  workspaceRoot: string,
): string[] {
  const dir = getEmailLeadDir(leadId, workspaceRoot)
  if (!fs.existsSync(dir)) return []
  const statuses: string[] = []
  const companyPath = path.join(dir, 'draft.json')
  if (fs.existsSync(companyPath)) {
    const s = readDraftStatus(companyPath)
    if (s) statuses.push(s)
  }
  for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!child.isDirectory()) continue
    const personPath = path.join(dir, child.name, 'draft.json')
    if (!fs.existsSync(personPath)) continue
    const s = readDraftStatus(personPath)
    if (s) statuses.push(s)
  }
  return statuses
}

export function countLeadDraftFiles(
  leadId: string,
  workspaceRoot: string,
): number {
  return listLeadDraftStatuses(leadId, workspaceRoot).length
}

/**
 * 按磁盘槽位重算 scored lead.status：
 * 无稿 → new；任一 approved → email_approved；否则 email_drafted
 */
export function recomputeLeadEmailStatus(
  productId: string,
  leadId: string,
  workspaceRoot: string,
): { ok: boolean; message: string; leadStatus: string; remainingDraftCount: number } {
  const statuses = listLeadDraftStatuses(leadId, workspaceRoot)
  const remainingDraftCount = statuses.length
  let leadStatus = 'email_drafted'
  if (remainingDraftCount === 0) leadStatus = 'new'
  else if (statuses.includes('approved')) leadStatus = 'email_approved'

  const statusResult = updateLeadStatus(productId, leadId, leadStatus, workspaceRoot)
  return {
    ok: statusResult.ok,
    message: statusResult.message,
    leadStatus,
    remainingDraftCount,
  }
}

function deleteEmailDraftSlotFiles(
  leadId: string,
  recipientKey: string,
  workspaceRoot: string,
): { removed: boolean; draftPath: string } {
  const key = recipientKey.trim() || 'company'
  const draftPath = resolveSlotDraftAbsPath(leadId, key, workspaceRoot)
  const mdPath = getMarkdownPath(leadId, key, workspaceRoot)
  let removed = false
  if (fs.existsSync(draftPath)) {
    fs.rmSync(draftPath, { force: true })
    removed = true
  }
  if (fs.existsSync(mdPath)) {
    fs.rmSync(mdPath, { force: true })
    removed = true
  }
  if (key !== 'company') {
    const personDir = path.dirname(draftPath)
    if (fs.existsSync(personDir)) {
      const left = fs.readdirSync(personDir)
      if (left.length === 0) {
        fs.rmSync(personDir, { recursive: true, force: true })
      }
    }
  }
  // 无任何 draft.json 则删空 lead 目录
  if (countLeadDraftFiles(leadId, workspaceRoot) === 0) {
    const dir = getEmailLeadDir(leadId, workspaceRoot)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  return { removed, draftPath: resolveSlotDraftRelPath(leadId, key) }
}

/**
 * 驳回邮件草稿。
 * - scope=slot（默认）：仅删当前收件人槽，其它槽保留；重算 lead status
 * - scope=lead：删整目录 + lead → new
 */
export function rejectEmailDraft(
  input: RejectEmailDraftInput,
  workspaceRoot: string,
): RejectEmailDraftResult {
  const productId = cleanString(input.productId)
  const leadId = cleanString(input.leadId)
  const scope = input.scope === 'lead' ? 'lead' : 'slot'
  const recipientKey = cleanString(input.recipientKey) || 'company'
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }

  if (scope === 'lead') {
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
          scope,
          leadStatus: 'new',
          remainingDraftCount: 0,
        }
      }
      return { ok: false, message: statusResult.message, productId, leadId, scope }
    }

    const removed = removeEmailDocuments(leadId, workspaceRoot)
    const parts = ['已驳回本线索全部开发信：线索状态回退为 new']
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
      scope,
      leadStatus: 'new',
      remainingDraftCount: 0,
    }
  }

  const draftPath = resolveSlotDraftAbsPath(leadId, recipientKey, workspaceRoot)
  if (!fs.existsSync(draftPath)) {
    return {
      ok: false,
      message: `未找到草稿：${resolveSlotDraftRelPath(leadId, recipientKey)}`,
      productId,
      leadId,
      recipientKey,
      scope,
    }
  }

  const deleted = deleteEmailDraftSlotFiles(leadId, recipientKey, workspaceRoot)
  if (!deleted.removed) {
    return {
      ok: false,
      message: '删除草稿失败',
      productId,
      leadId,
      recipientKey,
      scope,
    }
  }

  const recomputed = recomputeLeadEmailStatus(productId, leadId, workspaceRoot)
  if (!recomputed.ok) {
    return {
      ok: false,
      message: `已删除当前收件人草稿，但线索状态更新失败：${recomputed.message}`,
      productId,
      leadId,
      recipientKey,
      scope,
      leadStatus: recomputed.leadStatus,
      remainingDraftCount: recomputed.remainingDraftCount,
    }
  }

  return {
    ok: true,
    message:
      recomputed.remainingDraftCount === 0
        ? '已驳回当前收件人开发信；本线索已无剩余草稿，状态回退为 new'
        : `已驳回当前收件人开发信；仍保留 ${recomputed.remainingDraftCount} 封`,
    productId,
    leadId,
    recipientKey,
    scope,
    leadStatus: recomputed.leadStatus,
    remainingDraftCount: recomputed.remainingDraftCount,
  }
}

/**
 * 清空当前槽中文对照（外文重写后调用）。
 */
export function clearEmailDraftZh(
  leadId: string,
  recipientKey: string,
  workspaceRoot: string,
): { cleared: boolean; draftPath: string } {
  const key = cleanString(recipientKey) || 'company'
  const draftPath = resolveSlotDraftAbsPath(leadId, key, workspaceRoot)
  const rel = resolveSlotDraftRelPath(leadId, key)
  if (!fs.existsSync(draftPath)) {
    return { cleared: false, draftPath: rel }
  }

  let draft: Record<string, unknown>
  try {
    const parsed = asRecord(JSON.parse(fs.readFileSync(draftPath, 'utf8')))
    if (!parsed) return { cleared: false, draftPath: rel }
    draft = parsed
  } catch {
    return { cleared: false, draftPath: rel }
  }

  if (
    draft.subject_zh == null &&
    draft.body_zh == null &&
    draft.zh_source_hash == null
  ) {
    return { cleared: false, draftPath: rel }
  }

  const next = {
    ...draft,
    updated_at: new Date().toISOString(),
    subject_zh: null,
    body_zh: null,
    zh_source_hash: null,
  }
  fs.writeFileSync(draftPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { cleared: true, draftPath: rel }
}

/**
 * 按槽保存编辑：不改审批状态。
 */
export function saveEmailDraftSlot(
  input: SaveEmailDraftSlotInput,
  workspaceRoot: string,
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
  workspaceRoot: string,
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

  const recomputed = recomputeLeadEmailStatus(productId, leadId, workspaceRoot)
  if (!recomputed.ok) {
    return {
      ok: false,
      message: `草稿已标记 approved，但线索状态更新失败：${recomputed.message}`,
      productId,
      leadId,
      recipientKey,
      leadStatus: recomputed.leadStatus,
      remainingDraftCount: recomputed.remainingDraftCount,
    }
  }

  return {
    ok: true,
    message: `已通过并保存当前收件人草稿，线索状态 → ${recomputed.leadStatus}`,
    productId,
    leadId,
    recipientKey,
    leadStatus: recomputed.leadStatus,
    remainingDraftCount: recomputed.remainingDraftCount,
  }
}
