import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 与 I-10 library-office / 本模块 classify 一致 */
export const OFFICE_EXTRACT_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const

export const OFFICE_EXTRACT_TIMEOUT_MS = 60_000
export const OFFICE_EXTRACT_MAX_BUFFER = 16 * 1024 * 1024

export type OfficeExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: string }

/**
 * 对本地 Office 文件调用 officecli view <file> text。
 * 禁止调用 install / 无参裸跑。
 */
export async function extractOfficeTextToString(
  absSourcePath: string,
  cliExe: string,
): Promise<OfficeExtractResult> {
  try {
    const { stdout } = await execFileAsync(cliExe, ['view', absSourcePath, 'text'], {
      windowsHide: true,
      timeout: OFFICE_EXTRACT_TIMEOUT_MS,
      maxBuffer: OFFICE_EXTRACT_MAX_BUFFER,
      encoding: 'utf8',
    })
    const text = String(stdout ?? '')
    if (!text.trim()) {
      return { ok: false, reason: '抽出文本为空' }
    }
    return { ok: true, text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/ETIMEDOUT|timed out|TIMEOUT/i.test(msg)) {
      return { ok: false, reason: '抽取超时' }
    }
    return { ok: false, reason: msg }
  }
}

export function isOfficeExtractExtension(filePath: string): boolean {
  const base = filePath.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const name = slash >= 0 ? base.slice(slash + 1) : base
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  const ext = name.slice(dot).toLowerCase()
  return (OFFICE_EXTRACT_EXTENSIONS as readonly string[]).includes(ext)
}

/** 侧车相对路径：说明.docx → 说明.docx.txt */
export function officeSidecarRelPath(libraryRelPath: string): string {
  return `${libraryRelPath.replace(/\\/g, '/')}.txt`
}
