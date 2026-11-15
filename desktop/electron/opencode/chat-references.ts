import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type ChatReferenceKind = 'local' | 'library' | 'website' | 'profile'
export type ChatReferenceView = { id: string; kind: ChatReferenceKind; label: string; detail: string }
export type ChatReference = ChatReferenceView & { path: string; realPath: string; workspaceRoot: string; owner: number; url?: string }

const comparable = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
const inside = (root: string, target: string) => {
  const rel = path.relative(comparable(root), comparable(target))
  return !!rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

/** Only the native picker and validated library/profile selections mint handles. */
export class ChatReferenceRegistry {
  private entries = new Map<string, ChatReference>()
  clear() { this.entries.clear() }
  discard(owner: number, ids: readonly string[]) { for (const id of ids) if (this.entries.get(id)?.owner === owner) this.entries.delete(id) }
  addFile(owner: number, workspaceRoot: string, filename: string, kind: ChatReferenceKind, label?: string, detail?: string, url?: string): ChatReferenceView {
    if (!path.isAbsolute(filename)) throw new Error('文件路径无效。')
    const absolute = path.resolve(filename), realPath = fs.realpathSync(absolute)
    if (!fs.statSync(realPath).isFile()) throw new Error('请选择普通文件。')
    const ref: ChatReference = { id: randomUUID(), owner, workspaceRoot: path.resolve(workspaceRoot), kind, path: absolute, realPath, label: label || path.basename(absolute), detail: detail || absolute, ...(url ? { url } : {}) }
    this.entries.set(ref.id, ref)
    return { id: ref.id, kind: ref.kind, label: ref.label, detail: ref.detail }
  }
  addLibrary(owner: number, workspaceRoot: string, relative: string, kind: 'library' | 'website', url?: string, label?: string): ChatReferenceView {
    const rel = relative.replace(/\\/g, '/')
    if (!rel || path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel) || rel.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('资料库路径无效。')
    const root = path.join(workspaceRoot, 'data', 'library', 'files'), realRoot = fs.realpathSync(root)
    if (!inside(fs.realpathSync(workspaceRoot), realRoot)) throw new Error('资料库不在当前工作区中。')
    const target = path.join(root, ...rel.split('/'))
    if (!inside(realRoot, fs.realpathSync(target))) throw new Error('资料不在当前资料库中。')
    return this.addFile(owner, workspaceRoot, target, kind, label, rel, url)
  }
  addProfile(owner: number, workspaceRoot: string, productId: string, label?: string): ChatReferenceView {
    if (!/^[a-zA-Z0-9_.+-]+$/.test(productId) || productId === '.' || productId === '..') throw new Error('产品标识无效。')
    const products = path.join(workspaceRoot, 'data', 'products'), realRoot = fs.realpathSync(products)
    if (!inside(fs.realpathSync(workspaceRoot), realRoot)) throw new Error('产品目录不在当前工作区中。')
    const filename = path.join(products, productId, 'profile.json')
    if (!inside(realRoot, fs.realpathSync(filename))) throw new Error('产品画像不在当前工作区中。')
    return this.addFile(owner, workspaceRoot, filename, 'profile', label || productId, productId)
  }
  resolve(owner: number, workspaceRoot: string, ids: unknown): ChatReference[] {
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every(id => typeof id === 'string')) throw new Error('引用资料无效。')
    return [...new Set(ids)].map(id => {
      const ref = this.entries.get(id)
      if (!ref || ref.owner !== owner || comparable(ref.workspaceRoot) !== comparable(workspaceRoot)) throw new Error('资料引用已失效，请重新选择。')
      let real: string
      try { real = fs.realpathSync(ref.path); if (!fs.statSync(real).isFile() || comparable(real) !== comparable(ref.realPath)) throw new Error() }
      catch { throw new Error(`文件已移动、删除或不可访问：${ref.label}`) }
      return ref
    })
  }
}

/** Verify exactly the selected file, not the directory named by OpenCode's permission. */
export function isSelectedRead(refs: readonly ChatReference[], root: string, input: unknown, metadata: unknown): boolean {
  if (!input || typeof input !== 'object' || !metadata || typeof metadata !== 'object') return false
  const requested = (input as Record<string, unknown>).filePath
  const reported = (metadata as Record<string, unknown>).filepath
  if (typeof requested !== 'string' || typeof reported !== 'string' || !path.isAbsolute(reported)) return false
  try {
    const actual = fs.realpathSync(path.resolve(root, requested)), verified = fs.realpathSync(reported)
    if (comparable(actual) !== comparable(verified) || !fs.statSync(actual).isFile()) return false
    return refs.some(ref => comparable(ref.realPath) === comparable(actual) && comparable(fs.realpathSync(ref.path)) === comparable(actual))
  } catch { return false }
}
