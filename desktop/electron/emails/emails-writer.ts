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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function revertLeadStatusToNew(
  productId: string,
  leadId: string,
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
      nextLeads.push({ ...lead, status: 'new' })
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
  return { ok: true, message: '线索状态已回退为 new' }
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

  const statusResult = revertLeadStatusToNew(productId, leadId, workspaceRoot)
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
