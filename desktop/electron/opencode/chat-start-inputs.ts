import fs from 'node:fs'
import path from 'node:path'
import { readWebsiteBookmark } from '../library/library-website'
import type { BootstrapInput } from '../profile/profile-bootstrap'

/** 卡片值不可信：只接受资料库内真实文件，不跟随越界符号链接。 */
export function resolveChatProfileSources(sources: readonly string[], workspaceRoot: string): BootstrapInput {
  if (!sources.length) throw new Error('请至少选择一项资料')
  const root = path.join(workspaceRoot, 'data', 'library', 'files')
  const realWorkspace = fs.realpathSync(workspaceRoot)
  const realRoot = fs.realpathSync(root)
  if (!realRoot.startsWith(realWorkspace + path.sep)) throw new Error('资料库位于工作区外')
  const result: BootstrapInput = { websitePaths: [], filePaths: [] }
  for (const source of new Set(sources)) {
    const rel = source.replace(/\\/g, '/')
    if (!rel || path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel) || rel.split('/').some(p => !p || p === '.' || p === '..')) {
      throw new Error('非法资料路径')
    }
    const abs = path.join(root, rel)
    const real = fs.realpathSync(abs)
    if (!real.startsWith(realRoot + path.sep) || !fs.statSync(real).isFile()) throw new Error('资料必须是资料库内的文件')
    if (readWebsiteBookmark(abs)) result.websitePaths.push(rel)
    else result.filePaths.push(rel)
  }
  return result
}

export function assertChatIdentifier(value: string): void {
  if (!value || value === '.' || value === '..' || !/^[a-zA-Z0-9_.+-]+$/.test(value)) throw new Error('无效的产品、线索或收件槽标识')
}

/** 在会触发旧稿迁移的正式读取之前，只读校验聊天选择，失败不改稿。 */
export function validateChatTranslation(productId: string, leadId: string, recipientKey: string, workspaceRoot: string): void {
  for (const id of [productId, leadId, recipientKey]) assertChatIdentifier(id)
  const draftPath = recipientKey === 'company'
    ? path.join(workspaceRoot, 'data', 'emails', leadId, 'draft.json')
    : path.join(workspaceRoot, 'data', 'emails', leadId, recipientKey, 'draft.json')
  if (!fs.existsSync(draftPath)) throw new Error('未找到所选收件槽的外文草稿')
  const root = fs.realpathSync(workspaceRoot)
  if (!fs.realpathSync(draftPath).startsWith(root + path.sep)) throw new Error('草稿位于工作区外')
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8')) as Record<string, unknown>
  if (!draft || draft.product_id !== productId) throw new Error('草稿产品归属与所选产品不一致或缺失')
  if (typeof draft.subject !== 'string' || !draft.subject.trim() || typeof draft.body !== 'string' || !draft.body.trim()) {
    throw new Error('外文主题或正文为空，无法生成对照')
  }
}
