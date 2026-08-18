import fs from 'node:fs'
import path from 'node:path'
import {
  isMoveIntoSelfOrChild,
  joinRel,
  parentRel,
  sanitizeEntryName,
} from './library-name'
import { readWebsiteBookmark, rewriteWebsiteTitle } from './library-website'

export interface MutateResult {
  relativePath: string
  /** 刷新树时用作焦点目录：夹用自身，文件/书签用父夹 */
  focusDir: string
  changed: boolean
}

function filesRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'library', 'files')
}

function resolveUnderFiles(
  relativePath: string,
  workspaceRoot: string,
): { root: string; abs: string; rel: string } {
  const root = filesRoot(workspaceRoot)
  fs.mkdirSync(root, { recursive: true })
  const normalized = (relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('非法路径')
  }
  const abs = normalized ? path.join(root, ...normalized.split('/')) : root
  const resolved = path.resolve(abs)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('非法路径')
  }
  return { root, abs: resolved, rel: normalized }
}

function toFilesRel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/')
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

function websiteDestName(cleaned: string): { fileName: string; title: string } {
  const lower = cleaned.toLowerCase()
  const title = lower.endsWith('.md') ? cleaned.slice(0, -3) : cleaned
  const fileTitle = sanitizeEntryName(title)
  if (!fileTitle) throw new Error('名称无效')
  return { fileName: `${fileTitle}.md`, title: fileTitle }
}

export function renameLibraryEntry(
  relativePath: string,
  newName: string,
  workspaceRoot: string,
): MutateResult {
  const { root, abs, rel } = resolveUnderFiles(relativePath, workspaceRoot)
  if (!rel) throw new Error('不能重命名资料库根')
  if (!fs.existsSync(abs)) throw new Error('不存在')

  const st = fs.lstatSync(abs)
  if (st.isSymbolicLink()) throw new Error('不支持重命名符号链接')

  const bookmark = st.isFile() ? readWebsiteBookmark(abs) : null
  const cleaned = sanitizeEntryName(newName)
  if (!cleaned) throw new Error('名称无效')

  const destName = bookmark ? websiteDestName(cleaned).fileName : cleaned
  const destAbs = path.join(path.dirname(abs), destName)
  const destRel = toFilesRel(root, destAbs)
  const focusDir = st.isDirectory() ? destRel : parentRel(destRel)

  if (samePath(abs, destAbs)) {
    if (bookmark) {
      const title = websiteDestName(cleaned).title
      if (title !== bookmark.title) rewriteWebsiteTitle(abs, title)
    }
    return { relativePath: destRel, focusDir, changed: false }
  }

  if (fs.existsSync(destAbs)) throw new Error('已存在同名文件或文件夹')
  if (bookmark) rewriteWebsiteTitle(abs, websiteDestName(cleaned).title)
  fs.renameSync(abs, destAbs)
  return { relativePath: destRel, focusDir, changed: true }
}

export function moveLibraryEntry(
  relativePath: string,
  destDir: string,
  workspaceRoot: string,
): MutateResult {
  const src = resolveUnderFiles(relativePath, workspaceRoot)
  if (!src.rel) throw new Error('不能移动资料库根')
  if (!fs.existsSync(src.abs)) throw new Error('不存在')

  const st = fs.lstatSync(src.abs)
  if (st.isSymbolicLink()) throw new Error('不支持移动符号链接')

  const dest = resolveUnderFiles(destDir, workspaceRoot)
  if (!fs.existsSync(dest.abs) || !fs.statSync(dest.abs).isDirectory()) {
    throw new Error('目标不是文件夹')
  }

  if (st.isDirectory() && isMoveIntoSelfOrChild(src.rel, dest.rel)) {
    throw new Error('不能移动到自身或子文件夹')
  }

  const destAbs = path.join(dest.abs, path.basename(src.abs))
  const destRel = joinRel(dest.rel, path.basename(src.abs))
  const focusDir = st.isDirectory() ? destRel : dest.rel

  if (samePath(src.abs, destAbs)) {
    return { relativePath: destRel, focusDir, changed: false }
  }

  if (fs.existsSync(destAbs)) throw new Error('已存在同名文件或文件夹')
  fs.renameSync(src.abs, destAbs)
  return { relativePath: destRel, focusDir, changed: true }
}
