import fs from 'node:fs'
import path from 'node:path'
import { readWebsiteBookmark } from '../library/library-website'

export type SourceInput =
  | { type: 'website'; library_path: string; url: string }
  | { type: 'file'; library_path: string }

export interface CopiedLibrarySources {
  websiteUrls: string[]
  inputFiles: string[]
  sourceInputs: SourceInput[]
  skipped: string[]
}

function assertSafeRel(rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`非法路径: ${rel}`)
  }
  return normalized
}

function destUnderInputs(inputsDir: string, rel: string): { dest: string; stored: string } {
  const safe = assertSafeRel(rel)
  const dest = path.join(inputsDir, ...safe.split('/'))
  const resolved = path.resolve(dest)
  const root = path.resolve(inputsDir)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`非法路径: ${rel}`)
  }
  return { dest, stored: safe }
}

function storedInputPath(productId: string, relFromInputs: string): string {
  return `data/products/${productId}/inputs/${relFromInputs.replace(/\\/g, '/')}`
}

/**
 * 按相对 files/ 的路径拷到 inputs/ 下同样的子目录，不平铺、不改文件名。
 */
export function copyLibrarySourcesToInputs(
  productId: string,
  inputsDir: string,
  filesRoot: string,
  websitePaths: string[],
  filePaths: string[],
): CopiedLibrarySources {
  const websiteUrls: string[] = []
  const inputFiles: string[] = []
  const sourceInputs: SourceInput[] = []
  const skipped: string[] = []

  for (const rel of websitePaths) {
    try {
      const safe = assertSafeRel(rel)
      const src = path.join(filesRoot, ...safe.split('/'))
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        skipped.push(`${rel}（网站条目不存在）`)
        continue
      }
      const bookmark = readWebsiteBookmark(src)
      if (!bookmark) {
        skipped.push(`${rel}（不是网站书签）`)
        continue
      }
      const { dest, stored } = destUnderInputs(inputsDir, safe)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
      websiteUrls.push(bookmark.url)
      inputFiles.push(storedInputPath(productId, stored))
      sourceInputs.push({ type: 'website', library_path: stored, url: bookmark.url })
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  for (const rel of filePaths) {
    try {
      const safe = assertSafeRel(rel)
      const src = path.join(filesRoot, ...safe.split('/'))
      if (!fs.existsSync(src)) {
        skipped.push(`${rel}（文件不存在）`)
        continue
      }
      const st = fs.statSync(src)
      if (!st.isFile()) {
        skipped.push(`${path.basename(safe)}（请选择文件，不支持直接选目录）`)
        continue
      }
      if (readWebsiteBookmark(src)) {
        skipped.push(`${rel}（请按网站书签勾选，不要当普通文件）`)
        continue
      }
      const { dest, stored } = destUnderInputs(inputsDir, safe)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
      inputFiles.push(storedInputPath(productId, stored))
      sourceInputs.push({ type: 'file', library_path: stored })
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  return { websiteUrls, inputFiles, sourceInputs, skipped }
}
