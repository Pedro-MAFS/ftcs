import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { clipboard, dialog, BrowserWindow } from 'electron'
import { getWorkspaceRoot } from '../config/paths'
import { importFilesFromPaths as importTreeFromPaths, type ImportPathsResult } from './library-import'

export interface WebsiteItem {
  id: string
  title: string
  url: string
  relativePath: string
  createdAt?: string
  subtitle: string
}

export interface FileEntry {
  name: string
  kind: 'dir' | 'file'
  relativePath: string
  sizeBytes?: number
  modifiedAt?: string
}

function libraryRoot(workspaceRoot = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, 'data', 'library')
}

function websitesDir(workspaceRoot = getWorkspaceRoot()): string {
  return path.join(libraryRoot(workspaceRoot), 'websites')
}

function filesRoot(workspaceRoot = getWorkspaceRoot()): string {
  return path.join(libraryRoot(workspaceRoot), 'files')
}

export function ensureLibraryDirs(workspaceRoot = getWorkspaceRoot()): {
  libraryPath: string
  filesRoot: string
  websitesRoot: string
} {
  const root = libraryRoot(workspaceRoot)
  const websites = path.join(root, 'websites')
  const files = path.join(root, 'files')
  fs.mkdirSync(websites, { recursive: true })
  fs.mkdirSync(files, { recursive: true })
  return { libraryPath: root, filesRoot: files, websitesRoot: websites }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelativeDay(iso?: string): string {
  if (!iso) return '已加入'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '已加入'
  const dayMs = 24 * 60 * 60 * 1000
  const diff = Date.now() - t
  if (diff < dayMs) return '今天加入'
  if (diff < 2 * dayMs) return '昨天加入'
  return new Date(t).toLocaleDateString()
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

function hostFromUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return u.hostname || raw
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw
  }
}

function normalizeWebsiteUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('请输入公司网站 URL')
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProto)
  } catch {
    throw new Error('URL 格式无效')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http/https 网址')
  }
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function parseWebsiteMarkdown(content: string): { url?: string; title?: string; createdAt?: string } {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const fm = content.slice(3, end).trim()
  const out: { url?: string; title?: string; createdAt?: string } = {}
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    const value = m[2].trim().replace(/^["']|["']$/g, '')
    if (key === 'url') out.url = value
    if (key === 'title') out.title = value
    if (key === 'created_at') out.createdAt = value
  }
  return out
}

function writeWebsiteMarkdown(filePath: string, url: string, title: string): void {
  const createdAt = new Date().toISOString()
  const body = [
    '---',
    'type: website',
    `url: ${url}`,
    `title: ${title}`,
    `created_at: ${createdAt}`,
    '---',
    '',
    `公司网站：${url}`,
    '',
  ].join('\n')
  fs.writeFileSync(filePath, body, 'utf8')
}

/** 规范化 files/ 下的相对路径，禁止跳出沙箱 */
function resolveUnderFiles(
  relativeDir: string,
  workspaceRoot = getWorkspaceRoot(),
): { root: string; abs: string; rel: string } {
  const root = filesRoot(workspaceRoot)
  fs.mkdirSync(root, { recursive: true })
  const normalized = (relativeDir || '')
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
  return {
    root,
    abs: resolved,
    rel: normalized,
  }
}

function toFilesRel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/')
}

export type { ImportPathsResult }

export function listWebsites(workspaceRoot = getWorkspaceRoot()): WebsiteItem[] {
  ensureLibraryDirs(workspaceRoot)
  const dir = websitesDir(workspaceRoot)
  const items: WebsiteItem[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.md')) continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (!st.isFile()) continue
    const parsed = parseWebsiteMarkdown(fs.readFileSync(full, 'utf8'))
    const url = parsed.url || ''
    const title = parsed.title || hostFromUrl(url || name)
    const rel = path.join('websites', name).replace(/\\/g, '/')
    items.push({
      id: rel,
      title,
      url,
      relativePath: rel,
      createdAt: parsed.createdAt ?? st.mtime.toISOString(),
      subtitle: formatRelativeDay(parsed.createdAt ?? st.mtime.toISOString()),
    })
  }
  items.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0
    return tb - ta
  })
  return items
}

export function addWebsite(rawUrl: string, workspaceRoot = getWorkspaceRoot()): WebsiteItem {
  const url = normalizeWebsiteUrl(rawUrl)
  ensureLibraryDirs(workspaceRoot)
  const title = hostFromUrl(url)
  const dest = uniquePath(websitesDir(workspaceRoot), `${sanitizeBaseName(title)}.md`)
  writeWebsiteMarkdown(dest, url, title)
  const rel = path.join('websites', path.basename(dest)).replace(/\\/g, '/')
  return {
    id: rel,
    title,
    url,
    relativePath: rel,
    createdAt: new Date().toISOString(),
    subtitle: '今天加入',
  }
}

export function deleteWebsite(
  relativePath: string,
  workspaceRoot = getWorkspaceRoot(),
): void {
  ensureLibraryDirs(workspaceRoot)
  const normalized = relativePath.replace(/\\/g, '/')
  if (
    normalized.includes('..') ||
    path.isAbsolute(normalized) ||
    !normalized.startsWith('websites/') ||
    !normalized.toLowerCase().endsWith('.md')
  ) {
    throw new Error('非法路径')
  }
  const full = path.join(libraryRoot(workspaceRoot), ...normalized.split('/'))
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error('网站条目不存在')
  }
  fs.unlinkSync(full)
}

export function listFilesDir(
  relativeDir = '',
  workspaceRoot = getWorkspaceRoot(),
): { cwd: string; entries: FileEntry[] } {
  ensureLibraryDirs(workspaceRoot)
  const { root, abs, rel } = resolveUnderFiles(relativeDir, workspaceRoot)
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(abs, { recursive: true })
  }
  if (!fs.statSync(abs).isDirectory()) {
    throw new Error('路径不是目录')
  }

  const entries: FileEntry[] = []
  for (const name of fs.readdirSync(abs)) {
    if (name === '.' || name === '..') continue
    const full = path.join(abs, name)
    const st = fs.statSync(full)
    const entryRel = toFilesRel(root, full)
    if (st.isDirectory()) {
      entries.push({
        name,
        kind: 'dir',
        relativePath: entryRel,
        modifiedAt: st.mtime.toISOString(),
      })
    } else if (st.isFile()) {
      entries.push({
        name,
        kind: 'file',
        relativePath: entryRel,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      })
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { cwd: rel, entries }
}

export function createFolder(
  relativeDir: string,
  folderName: string,
  workspaceRoot = getWorkspaceRoot(),
): FileEntry {
  const name = sanitizeBaseName(folderName.trim())
  if (!name) throw new Error('请输入目录名')
  const { root, abs } = resolveUnderFiles(relativeDir, workspaceRoot)
  fs.mkdirSync(abs, { recursive: true })
  const dest = path.join(abs, name)
  if (fs.existsSync(dest)) throw new Error('同名目录已存在')
  fs.mkdirSync(dest)
  return {
    name,
    kind: 'dir',
    relativePath: toFilesRel(root, dest),
    modifiedAt: new Date().toISOString(),
  }
}

export function deleteFilesEntry(
  relativePath: string,
  workspaceRoot = getWorkspaceRoot(),
): void {
  const { abs } = resolveUnderFiles(relativePath, workspaceRoot)
  if (!fs.existsSync(abs)) throw new Error('不存在')
  fs.rmSync(abs, { recursive: true, force: true })
}

function importAbsolutePaths(
  relativeDir: string,
  absolutePaths: string[],
  workspaceRoot = getWorkspaceRoot(),
  options?: { maxNodes?: number; maxDepth?: number },
): ImportPathsResult {
  return importTreeFromPaths(relativeDir, absolutePaths, workspaceRoot, options)
}

export async function pickAndImportFiles(
  relativeDir = '',
  parent?: BrowserWindow | null,
  workspaceRoot = getWorkspaceRoot(),
): Promise<ImportPathsResult> {
  const options = {
    title: '选择文件导入资料库',
    properties: ['openFile', 'multiSelections'] as Array<
      'openFile' | 'multiSelections'
    >,
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return { imported: 0, dirsCreated: 0, skipped: [] }
  }
  return importAbsolutePaths(relativeDir, result.filePaths, workspaceRoot)
}

export async function pickAndImportFolders(
  relativeDir = '',
  parent?: BrowserWindow | null,
  workspaceRoot = getWorkspaceRoot(),
): Promise<ImportPathsResult> {
  const options = {
    title: '选择要导入的文件夹',
    properties: ['openDirectory', 'multiSelections'] as Array<
      'openDirectory' | 'multiSelections'
    >,
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return { imported: 0, dirsCreated: 0, skipped: [] }
  }
  return importAbsolutePaths(relativeDir, result.filePaths, workspaceRoot)
}

export function importFilesFromPaths(
  relativeDir: string,
  absolutePaths: string[],
  workspaceRoot = getWorkspaceRoot(),
  options?: { maxNodes?: number; maxDepth?: number },
): ImportPathsResult {
  if (!absolutePaths.length) return { imported: 0, dirsCreated: 0, skipped: [] }
  return importAbsolutePaths(relativeDir, absolutePaths, workspaceRoot, options)
}

/** 读取系统剪贴板中的文件路径（资源管理器复制文件后） */
export function readClipboardFilePaths(): string[] {
  if (process.platform === 'win32') {
    // 优先：Electron 原生 CF_HDROP / FileNameW（不依赖 PowerShell STA）
    try {
      const buf = clipboard.readBuffer('FileNameW')
      if (buf && buf.length > 2) {
        const text = buf.toString('ucs2').replace(/\0+$/g, '')
        const paths = text
          .split('\0')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && fs.existsSync(line))
        if (paths.length) return paths
      }
    } catch {
      // fall through
    }

    try {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$list = [System.Windows.Forms.Clipboard]::GetFileDropList()',
        'if ($list -ne $null) { $list | ForEach-Object { $_ } }',
      ].join('; ')
      // Clipboard.GetFileDropList 需要 STA；PowerShell 默认可能是 MTA
      const out = execFileSync(
        'powershell.exe',
        ['-STA', '-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 },
      )
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && fs.existsSync(line))
    } catch {
      return []
    }
  }

  if (process.platform === 'darwin') {
    try {
      const out = execFileSync(
        'osascript',
        [
          '-e',
          'try\nset theFiles to the clipboard as «class furl»\non error\nreturn ""\nend try\nif theFiles is "" then return ""\nset out to ""\nrepeat with f in theFiles\nset out to out & (POSIX path of f) & linefeed\nend repeat\nreturn out',
        ],
        { encoding: 'utf8', timeout: 5000 },
      )
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && fs.existsSync(line))
    } catch {
      return []
    }
  }

  return []
}

export function pasteClipboardFiles(
  relativeDir: string,
  workspaceRoot = getWorkspaceRoot(),
): ImportPathsResult {
  const paths = readClipboardFilePaths()
  if (!paths.length) {
    return {
      imported: 0,
      dirsCreated: 0,
      skipped: ['剪贴板中没有可粘贴的文件（请先在资源管理器中复制文件）'],
    }
  }
  return importAbsolutePaths(relativeDir, paths, workspaceRoot)
}

export function describeFileEntry(entry: FileEntry): string {
  if (entry.kind === 'dir') return '文件夹'
  return formatBytes(entry.sizeBytes ?? 0)
}
