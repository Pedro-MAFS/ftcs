const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/** 资料库条目名：保留中文与空格，只处理 Windows 非法字符。无效时返回空串。 */
export function sanitizeEntryName(raw: string): string {
  let name = raw.trim().replace(ILLEGAL_CHARS, '_')
  name = name.replace(/[. ]+$/g, '')
  name = name.slice(0, 120)
  if (!name || name === '.' || name === '..' || WIN_RESERVED.test(name)) return ''
  return name
}

export function parentRel(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function remapPathPrefix(current: string, from: string, to: string): string {
  const path = (current || '').replace(/\\/g, '/')
  const src = (from || '').replace(/\\/g, '/')
  const dest = (to || '').replace(/\\/g, '/')
  if (!src) return path
  if (path === src) return dest
  if (path.startsWith(`${src}/`)) return `${dest}${path.slice(src.length)}`
  return path
}

export function remapPathSet(paths: Iterable<string>, from: string, to: string): Set<string> {
  return new Set([...paths].map((item) => remapPathPrefix(item, from, to)))
}

export function joinRel(dir: string, name: string): string {
  const parent = (dir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return parent ? `${parent}/${name}` : name
}

export function isMoveIntoSelfOrChild(srcRel: string, destDir: string): boolean {
  const src = (srcRel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const dest = (destDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!src) return true
  if (dest === src) return true
  return dest.startsWith(`${src}/`)
}
