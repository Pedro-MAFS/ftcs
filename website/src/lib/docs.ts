import { docsIndex, type DocMeta } from '../content/docs-index'

const rawModules = import.meta.glob('../../content/docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function slugFromPath(path: string): string {
  const name = path.split('/').pop() ?? ''
  return name.replace(/\.md$/, '')
}

const bodyBySlug = new Map<string, string>()
for (const [path, body] of Object.entries(rawModules)) {
  bodyBySlug.set(slugFromPath(path), body)
}

export function listDocs(): DocMeta[] {
  return docsIndex
}

export function getDoc(slug: string): { meta: DocMeta; body: string } | null {
  const meta = docsIndex.find((d) => d.slug === slug)
  const body = bodyBySlug.get(slug)
  if (!meta || body == null) return null
  return { meta, body }
}
