import fs from 'node:fs'
import path from 'node:path'

export interface WebsiteBookmark {
  title: string
  url: string
  relativePath: string
  createdAt: string
}

function filesRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'library', 'files')
}

function websitesDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'library', 'websites')
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

function resolveUnderFiles(relativeDir: string, workspaceRoot: string): { root: string; abs: string } {
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
  return { root, abs: resolved }
}

export function hostFromUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return u.hostname || raw
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0] || raw
  }
}

export function normalizeWebsiteUrl(raw: string): string {
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

export function parseWebsiteMarkdown(content: string): {
  type?: string
  url?: string
  title?: string
  createdAt?: string
} {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const fm = content.slice(3, end).trim()
  const out: { type?: string; url?: string; title?: string; createdAt?: string } = {}
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    const value = m[2].trim().replace(/^["']|["']$/g, '')
    if (key === 'type') out.type = value
    if (key === 'url') out.url = value
    if (key === 'title') out.title = value
    if (key === 'created_at') out.createdAt = value
  }
  return out
}

export function readWebsiteBookmark(fullPath: string): { url: string; title: string } | null {
  if (!fullPath.toLowerCase().endsWith('.md')) return null
  let content: string
  try {
    content = fs.readFileSync(fullPath, 'utf8')
  } catch {
    return null
  }
  const parsed = parseWebsiteMarkdown(content)
  if (parsed.type !== 'website' || !parsed.url) return null
  return {
    url: parsed.url,
    title: parsed.title || hostFromUrl(parsed.url),
  }
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

function listWebsiteUrlsInDir(absDir: string): string[] {
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return []
  const urls: string[] = []
  for (const name of fs.readdirSync(absDir)) {
    const full = path.join(absDir, name)
    try {
      if (!fs.statSync(full).isFile()) continue
    } catch {
      continue
    }
    const meta = readWebsiteBookmark(full)
    if (meta) urls.push(meta.url)
  }
  return urls
}

export function addWebsiteToFolder(
  rawUrl: string,
  relativeDir: string,
  workspaceRoot: string,
): WebsiteBookmark {
  const url = normalizeWebsiteUrl(rawUrl)
  const { root, abs } = resolveUnderFiles(relativeDir, workspaceRoot)
  fs.mkdirSync(abs, { recursive: true })
  if (listWebsiteUrlsInDir(abs).includes(url)) {
    throw new Error('该文件夹已保存此网站')
  }
  const title = hostFromUrl(url)
  const dest = uniquePath(abs, `${sanitizeBaseName(title)}.md`)
  writeWebsiteMarkdown(dest, url, title)
  const relativePath = path.relative(root, dest).replace(/\\/g, '/')
  return {
    title,
    url,
    relativePath,
    createdAt: new Date().toISOString(),
  }
}

export function migrateWebsitesIntoFiles(workspaceRoot: string): { moved: number; skipped: string[] } {
  const srcDir = websitesDir(workspaceRoot)
  const destRoot = filesRoot(workspaceRoot)
  const skipped: string[] = []
  if (!fs.existsSync(srcDir)) return { moved: 0, skipped }
  fs.mkdirSync(destRoot, { recursive: true })

  let moved = 0
  let names: string[]
  try {
    names = fs.readdirSync(srcDir)
  } catch {
    return { moved: 0, skipped: ['无法读取旧网站目录'] }
  }

  for (const name of names) {
    if (!name.toLowerCase().endsWith('.md')) continue
    const src = path.join(srcDir, name)
    try {
      if (!fs.statSync(src).isFile()) continue
      const dest = uniquePath(destRoot, name)
      fs.renameSync(src, dest)
      moved += 1
    } catch (err) {
      skipped.push(`${name}（${err instanceof Error ? err.message : String(err)}）`)
    }
  }

  return { moved, skipped }
}
