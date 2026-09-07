import fs from 'node:fs'
import { DocuText } from 'docutext'

export const PDF_EXTRACT_TIMEOUT_MS = 60_000
export const PDF_MAX_BYTES = 20 * 1024 * 1024
export const PDF_MIN_EFFECTIVE_CHARS = 80
export const PDF_MAX_SIDECAR_BYTES = 512 * 1024

export const PDF_SIDECAR_TRUNCATED_BANNER = '[侧车已截断，仅保留前 512KB 文本]'

export type PdfExtractFailReason =
  | 'too_large'
  | 'timeout'
  | 'encrypted_or_invalid'
  | 'scanned'
  | 'empty'

export type PdfExtractResult =
  | { ok: true; text: string; truncated?: boolean }
  | { ok: false; reason: PdfExtractFailReason }

/** 去掉空白后的字符数；CJK 与拉丁均计 1 */
export function countEffectiveTextChars(text: string): number {
  return text.replace(/\s+/g, '').length
}

export function isPdfExtension(filePath: string): boolean {
  const base = filePath.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const name = slash >= 0 ? base.slice(slash + 1) : base
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return name.slice(dot).toLowerCase() === '.pdf'
}

/** 侧车相对路径：说明.pdf → 说明.pdf.txt（与 Office 侧车规则一致） */
export function pdfSidecarRelPath(libraryRelPath: string): string {
  return `${libraryRelPath.replace(/\\/g, '/')}.txt`
}

export function pdfSkippedLabel(reason: PdfExtractFailReason): string {
  switch (reason) {
    case 'too_large':
      return 'PDF 超过 20MB 上限'
    case 'timeout':
      return 'PDF 文本抽取超时'
    case 'encrypted_or_invalid':
      return 'PDF 已加密或无法解析'
    case 'scanned':
    case 'empty':
      return '未能提取 PDF 文本，扫描件暂不支持'
  }
}

/**
 * pdf-parse 抽出的文本可能含 \\0 等 C0 控制符；OpenCode Read 遇 \\0 即报 Cannot read binary file。
 * 保留 \\t \\n \\r，去掉其余不可见控制符。
 */
export function sanitizePdfSidecarText(rawText: string): string {
  return rawText.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

export function preparePdfSidecarText(rawText: string): {
  text: string
  truncated: boolean
} {
  const normalized = sanitizePdfSidecarText(rawText).replace(/\r\n/g, '\n')
  let text = normalized
  let truncated = false
  if (Buffer.byteLength(text, 'utf8') > PDF_MAX_SIDECAR_BYTES) {
    truncated = true
    const body = truncateUtf8(text, PDF_MAX_SIDECAR_BYTES - Buffer.byteLength(PDF_SIDECAR_TRUNCATED_BANNER, 'utf8') - 1)
    text = `${PDF_SIDECAR_TRUNCATED_BANNER}\n${body}`
  }
  return { text, truncated }
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (Buffer.byteLength(text.slice(0, mid), 'utf8') <= maxBytes) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo)
}

function mapPdfParseError(err: unknown): PdfExtractFailReason {
  const msg = err instanceof Error ? err.message : String(err)
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'timeout'
  const lower = msg.toLowerCase()
  if (/password|encrypt|permission|invalid pdf|bad xref|corrupt|malformed|could not recover pdf/i.test(lower)) {
    return 'encrypted_or_invalid'
  }
  return 'encrypted_or_invalid'
}

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  const doc = DocuText.fromBuffer(new Uint8Array(buffer))
  return doc.text ?? ''
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PDF extract timeout')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 从本地 PDF 抽取文本层（US-I-13）。不 OCR；不读内嵌图。
 */
export async function extractPdfTextToString(absSourcePath: string): Promise<PdfExtractResult> {
  let st: fs.Stats
  try {
    st = fs.statSync(absSourcePath)
  } catch {
    return { ok: false, reason: 'encrypted_or_invalid' }
  }
  if (!st.isFile()) {
    return { ok: false, reason: 'encrypted_or_invalid' }
  }
  if (st.size > PDF_MAX_BYTES) {
    return { ok: false, reason: 'too_large' }
  }

  let buffer: Buffer
  try {
    buffer = fs.readFileSync(absSourcePath)
  } catch {
    return { ok: false, reason: 'encrypted_or_invalid' }
  }

  let rawText: string
  try {
    rawText = await withTimeout(parsePdfBuffer(buffer), PDF_EXTRACT_TIMEOUT_MS)
  } catch (err) {
    return { ok: false, reason: mapPdfParseError(err) }
  }

  const effective = countEffectiveTextChars(rawText)
  if (effective === 0) {
    return { ok: false, reason: 'empty' }
  }
  if (effective < PDF_MIN_EFFECTIVE_CHARS) {
    return { ok: false, reason: 'scanned' }
  }

  const { text, truncated } = preparePdfSidecarText(rawText)
  if (!text.trim()) {
    return { ok: false, reason: 'empty' }
  }
  return { ok: true, text, truncated }
}
