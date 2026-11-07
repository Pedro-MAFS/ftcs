import fs, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import type { SaveTextToDownloadsInput, SaveTextToDownloadsResult } from '../ipc/types'

const INVALID_NAME = '文件名无效'
const INVALID_CONTENT = '内容无效'
const MAX_SUFFIX = 10_000

function shortSaveError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const line = (raw.split(/\r?\n/, 1)[0] ?? '').trim()
  const text = line || '写入失败'
  return text.length > 120 ? text.slice(0, 120) : text
}

function isValidDownloadFileName(name: string): boolean {
  if (name.length === 0 || name === '.' || name === '..') return false
  if (name.includes('/') || name.includes('\\') || name.includes('\0') || name.includes('..')) {
    return false
  }
  if (!name.endsWith('.txt')) return false
  return path.basename(name) === name && path.win32.basename(name) === name
}

function fileNameFor(suggestedName: string, suffix: number): string {
  if (suffix === 0) return suggestedName
  const stem = suggestedName.slice(0, -'.txt'.length)
  return `${stem}-${suffix}.txt`
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function staysInDir(dir: string, target: string): boolean {
  const rel = path.relative(dir, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export async function saveTextToDownloads(
  downloadsDir: string,
  input: SaveTextToDownloadsInput | null | undefined,
): Promise<SaveTextToDownloadsResult> {
  const suggestedName = input?.suggestedName
  if (typeof suggestedName !== 'string' || !isValidDownloadFileName(suggestedName)) {
    return { ok: false, error: INVALID_NAME }
  }
  const content = input?.content
  if (typeof content !== 'string') {
    return { ok: false, error: INVALID_CONTENT }
  }

  const dir = path.resolve(downloadsDir)
  for (let suffix = 0; suffix < MAX_SUFFIX; suffix += 1) {
    const target = path.resolve(dir, fileNameFor(suggestedName, suffix))
    if (!staysInDir(dir, target)) return { ok: false, error: INVALID_NAME }

    let handle: FileHandle | undefined
    try {
      handle = await fs.open(target, 'wx')
      await handle.writeFile(content, { encoding: 'utf8' })
      await handle.close()
      handle = undefined
      return { ok: true, path: target }
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {})
        handle = undefined
        await fs.unlink(target).catch(() => {})
      }
      if (errorCode(error) === 'EEXIST') continue
      return { ok: false, error: shortSaveError(error) }
    }
  }

  return { ok: false, error: '无法分配不冲突的文件名' }
}
