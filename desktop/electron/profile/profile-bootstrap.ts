import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { generateProductId } from './product-id'

export interface BootstrapInput {
  websitePaths: string[]
  filePaths: string[]
}

export interface BootstrapResult {
  productId: string
  productDir: string
  inputsDir: string
  websiteUrls: string[]
  inputFiles: string[]
  skipped: string[]
}

function sanitizeBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return cleaned || 'untitled'
}

function uniquePath(dir: string, fileName: string): string {
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let candidate = path.join(dir, fileName)
  let i = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${i}${ext}`)
    i += 1
  }
  return candidate
}

function assertSafeRel(rel: string, kind: 'website' | 'file'): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`非法路径: ${rel}`)
  }
  if (kind === 'website' && !normalized.startsWith('websites/')) {
    throw new Error(`网站路径无效: ${rel}`)
  }
  return normalized
}

function parseWebsiteUrl(content: string): string | undefined {
  if (!content.startsWith('---')) return undefined
  const end = content.indexOf('\n---', 3)
  if (end < 0) return undefined
  const fm = content.slice(3, end)
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^url:\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

/**
 * 从资料库选中项分配产品 ID，并复制快照到 data/products/{id}/inputs/。
 */
export function bootstrapProductFromLibrary(
  input: BootstrapInput,
  workspaceRoot = getWorkspaceRoot(),
): BootstrapResult {
  const websitePaths = [...new Set(input.websitePaths ?? [])]
  const filePaths = [...new Set(input.filePaths ?? [])]
  if (!websitePaths.length && !filePaths.length) {
    throw new Error('请先勾选至少一个公司网站或资料文件')
  }

  const productId = generateProductId(workspaceRoot)
  const productDir = path.join(workspaceRoot, 'data', 'products', productId)
  const inputsDir = path.join(productDir, 'inputs')
  fs.mkdirSync(inputsDir, { recursive: true })

  const websiteUrls: string[] = []
  const inputFiles: string[] = []
  const skipped: string[] = []
  const libraryRoot = path.join(workspaceRoot, 'data', 'library')
  const filesRoot = path.join(libraryRoot, 'files')

  for (const rel of websitePaths) {
    try {
      const safe = assertSafeRel(rel, 'website')
      const src = path.join(libraryRoot, ...safe.split('/'))
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        skipped.push(`${rel}（网站条目不存在）`)
        continue
      }
      const content = fs.readFileSync(src, 'utf8')
      const url = parseWebsiteUrl(content)
      if (url) websiteUrls.push(url)
      const dest = uniquePath(inputsDir, sanitizeBaseName(path.basename(src)))
      fs.copyFileSync(src, dest)
      inputFiles.push(`data/products/${productId}/inputs/${path.basename(dest)}`)
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  for (const rel of filePaths) {
    try {
      const safe = assertSafeRel(rel, 'file')
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
      const dest = uniquePath(inputsDir, sanitizeBaseName(path.basename(src)))
      fs.copyFileSync(src, dest)
      inputFiles.push(`data/products/${productId}/inputs/${path.basename(dest)}`)
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  if (!websiteUrls.length && !inputFiles.length) {
    throw new Error(`没有可导入的资料：${skipped.join('；') || '未知原因'}`)
  }

  const manifest = {
    product_id: productId,
    created_at: new Date().toISOString(),
    websites: websiteUrls,
    files: inputFiles,
    skipped,
  }
  fs.writeFileSync(
    path.join(inputsDir, '_sources.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )

  return {
    productId,
    productDir,
    inputsDir,
    websiteUrls,
    inputFiles,
    skipped,
  }
}
