export const LIBRARY_DRAG_TYPE = 'application/x-ftcs-library'

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
