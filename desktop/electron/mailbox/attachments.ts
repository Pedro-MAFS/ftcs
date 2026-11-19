import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { uuid } from './storage'

export interface StoredAttachment {
  attachment_id?: string
  filename: string
  size_bytes: number
  mime_type?: string
  availability?: 'local' | 'remote'
}

const previewExtensions = new Set(
  'pdf txt csv rtf md doc docx xls xlsx ppt pptx odt ods odp pages numbers key jpg jpeg png gif webp tif tiff bmp heic heif avif mp3 m4a wav ogg flac mp4 mov m4v webm avi mkv'.split(
    ' ',
  ),
)
const extensionsByType: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

export function describeAttachment(a: StoredAttachment) {
  let filename =
    path.win32
      .basename(a.filename || '附件')
      .replace(/[<>:"|?*\x00-\x1f\u202a-\u202e\u2066-\u2069]/g, '_')
      .trim()
      .replace(/[. ]+$/, '') || '附件'
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) filename = '_' + filename
  const inferred = extensionsByType[a.mime_type ?? '']
  if (!path.extname(filename) && typeof inferred === 'string') filename += '.' + inferred
  const extension = path.extname(filename)
  // Leave room for multibyte filenames on filesystems with a 255-byte component limit.
  if (Buffer.byteLength(filename) > 240) {
    const suffix = Buffer.byteLength(extension) <= 24 ? extension : ''
    let stem = ''
    for (const char of path.basename(filename, extension)) {
      if (Buffer.byteLength(stem + char + suffix) > 240) break
      stem += char
    }
    filename = (stem || '附件') + suffix
  }
  const available = !!a.attachment_id && uuid(a.attachment_id) && a.availability !== 'remote'
  return {
    filename,
    size_bytes: a.size_bytes,
    available,
    previewable: available && previewExtensions.has(path.extname(filename).slice(1).toLowerCase()),
  }
}

export function localAttachment(account: string, a: StoredAttachment) {
  const info = describeAttachment(a)
  if (!info.available) throw new Error('附件尚未保存在本机。')
  const directory = path.join(fs.realpathSync(account), 'attachments', a.attachment_id!)
  const content = path.join(directory, 'content')
  try {
    if (fs.realpathSync(content) !== content || !fs.statSync(content).isFile()) throw new Error()
  } catch {
    throw new Error('本地附件文件缺失或不可读。')
  }
  return { ...info, content }
}

type LocalFile = ReturnType<typeof localAttachment>
export async function saveAttachment(file: LocalFile, target: string, current: () => void) {
  const temp = path.join(path.dirname(target), '.ftcs-' + randomUUID() + '.tmp')
  try {
    current()
    await fs.promises.copyFile(file.content, temp, fs.constants.COPYFILE_EXCL)
    current()
    await fs.promises.rename(temp, target)
  } finally {
    await fs.promises.rm(temp, { force: true })
  }
}

const previews = new Set<string>()
export function clearAttachmentPreviews() {
  for (const dir of previews) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      previews.delete(dir)
    } catch {
      /* A Windows viewer can keep the file locked until it closes. Retry on the next cleanup. */
    }
  }
}
export async function openAttachment(
  file: LocalFile,
  current: () => void,
  openPath: (file: string) => Promise<string>,
) {
  if (!file.previewable) throw new Error('此类型的附件请先另存为。')
  current()
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ftcs-mail-preview-'))
  previews.add(dir)
  try {
    const copy = path.join(dir, file.filename)
    await fs.promises.copyFile(file.content, copy, fs.constants.COPYFILE_EXCL)
    await fs.promises.chmod(copy, 0o600)
    current()
    const error = await openPath(copy)
    if (error) throw new Error('系统无法打开此附件，请选择另存为后用其他应用打开。')
  } catch (error) {
    await fs.promises.rm(dir, { recursive: true, force: true })
    previews.delete(dir)
    throw error
  }
}
