import fs from 'node:fs'
import path from 'node:path'
import { readWebsiteBookmark } from '../library/library-website'
import {
  extractOfficeTextToString,
  isOfficeExtractExtension,
  officeSidecarRelPath,
  type OfficeExtractResult,
} from './profile-office-extract'

export type SourceInput =
  | { type: 'website'; library_path: string; url: string }
  | { type: 'file'; library_path: string }

/** 与 lead-store file-types.ts 对齐 */
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
])

/** pdf / 老格式 / 图片等；docx/xlsx/pptx 已拆到 office（见 US-I-11） */
const SPECIAL_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.xls',
  '.doc',
  '.ppt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
])

export type InputFileKind = 'supported' | 'office' | 'special' | 'unknown'

export type OfficeExtractFn = (
  absSourcePath: string,
  cliExe: string,
) => Promise<OfficeExtractResult>

export function classifyInputFile(filePath: string): InputFileKind {
  const base = filePath.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const name = slash >= 0 ? base.slice(slash + 1) : base
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase()
  if (SUPPORTED_TEXT_EXTENSIONS.has(ext)) return 'supported'
  if (isOfficeExtractExtension(base)) return 'office'
  if (SPECIAL_FILE_EXTENSIONS.has(ext)) return 'special'
  return 'unknown'
}

export interface CopiedLibrarySources {
  websiteUrls: string[]
  inputFiles: string[]
  sourceInputs: SourceInput[]
  skipped: string[]
}

export interface CopyLibrarySourcesOptions {
  /** 单测注入；默认走真 OfficeCLI extract */
  extractOffice?: OfficeExtractFn
  /**
   * 解析 OfficeCLI。生产由 bootstrap 传入 resolveConfiguredOfficeCli；
   * 未传则视为未安装（避免本模块静态依赖 electron）。
   */
  resolveCli?: () => { exe: string; source: string } | null
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
 * Office（docx/xlsx/pptx）：原件 + 侧车 .txt；Prompt 只列侧车。
 */
export async function copyLibrarySourcesToInputs(
  productId: string,
  inputsDir: string,
  filesRoot: string,
  websitePaths: string[],
  filePaths: string[],
  options?: CopyLibrarySourcesOptions,
): Promise<CopiedLibrarySources> {
  const websiteUrls: string[] = []
  const inputFiles: string[] = []
  const sourceInputs: SourceInput[] = []
  const skipped: string[] = []
  const extractOffice = options?.extractOffice ?? extractOfficeTextToString
  const resolveCli = options?.resolveCli ?? (() => null)

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
      sourceInputs.push({ type: 'website', library_path: stored, url: bookmark.url })
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  let cliExe: string | null = null
  let cliResolved = false
  function ensureCli(): string | null {
    if (!cliResolved) {
      cliResolved = true
      cliExe = resolveCli()?.exe ?? null
    }
    return cliExe
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

      const kind = classifyInputFile(safe)
      if (kind === 'special' || kind === 'unknown') {
        skipped.push(`${rel}（当前不支持该格式）`)
        continue
      }

      if (kind === 'supported') {
        const { dest, stored } = destUnderInputs(inputsDir, safe)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
        inputFiles.push(storedInputPath(productId, stored))
        sourceInputs.push({ type: 'file', library_path: stored })
        continue
      }

      // office
      const exe = ensureCli()
      if (!exe) {
        skipped.push(`${rel}（未安装 OfficeCLI）`)
        continue
      }

      const extracted = await extractOffice(src, exe)
      if (!extracted.ok) {
        const label =
          extracted.reason === '抽出文本为空'
            ? '抽出文本为空'
            : `Office 文本抽取失败：${extracted.reason}`
        skipped.push(`${rel}（${label}）`)
        continue
      }

      const { dest, stored } = destUnderInputs(inputsDir, safe)
      const sidecarRel = officeSidecarRelPath(stored)
      const { dest: sidecarDest, stored: sidecarStored } = destUnderInputs(
        inputsDir,
        sidecarRel,
      )
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
      fs.writeFileSync(sidecarDest, extracted.text, 'utf8')
      inputFiles.push(storedInputPath(productId, sidecarStored))
      sourceInputs.push({ type: 'file', library_path: stored })
    } catch (err) {
      skipped.push(`${rel}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  return { websiteUrls, inputFiles, sourceInputs, skipped }
}
