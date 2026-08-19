import {
  isOfficeExtractExtension,
  officeSidecarRelPath,
} from './profile-office-extract'

export interface SourcesManifest {
  product_id?: string
  created_at?: string
  files?: string[]
  source_inputs?: Array<{
    type?: string
    library_path?: string
    url?: string
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function slashPath(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/')
}

/**
 * 资料库相对路径 → inputs 下 Agent 可读路径。
 * Office：library_path 为原件，映射到侧车 .txt。
 */
export function inputsPathFor(manifest: SourcesManifest, libraryPath: string): string {
  const lib = slashPath(libraryPath)
  const candidateLibs = isOfficeExtractExtension(lib)
    ? [officeSidecarRelPath(lib), lib]
    : [lib]

  for (const candidate of candidateLibs) {
    const listed = (manifest.files ?? []).find((item) => {
      const n = slashPath(item)
      return (
        n === candidate ||
        n.endsWith(`/inputs/${candidate}`) ||
        n.endsWith(`/${candidate}`)
      )
    })
    if (listed) return slashPath(listed)
  }

  const id = manifest.product_id || 'unknown'
  const preferred = candidateLibs[0] ?? lib
  return `data/products/${id}/inputs/${preferred}`
}

function isBookmarkFilePath(
  filePath: string,
  bookmarkPaths: Set<string>,
  websiteLibraryPaths: string[],
): boolean {
  const n = slashPath(filePath)
  if (!n) return false
  if (bookmarkPaths.has(n)) return true
  return websiteLibraryPaths.some((lib) => n === lib || n.endsWith(`/${lib}`))
}

/**
 * 用 _sources.json 补齐画像 source_inputs：官网记 website，文本记 file；
 * 去掉把书签 md 误记成 file；保留 Agent 多写的爬取 URL。
 */
export function mergeSourceInputs(
  profileSourceInputs: unknown,
  manifest: SourcesManifest,
): Record<string, unknown>[] {
  const existing = Array.isArray(profileSourceInputs)
    ? profileSourceInputs.filter(isRecord)
    : []
  if (existing.some((item) => item.type === 'manual')) return existing

  const sources = manifest.source_inputs ?? []
  const websiteLibraryPaths = sources
    .filter((item) => item.type === 'website' && item.library_path)
    .map((item) => slashPath(item.library_path))
  const bookmarkPaths = new Set(
    websiteLibraryPaths.map((lib) => inputsPathFor(manifest, lib)),
  )
  const fallbackTime = manifest.created_at || new Date().toISOString()

  const requiredWebsites: Record<string, unknown>[] = []
  const seenUrls = new Set<string>()
  for (const item of sources) {
    if (item.type !== 'website') continue
    const url = String(item.url ?? '').trim()
    if (!url || seenUrls.has(url)) continue
    seenUrls.add(url)
    const prev = existing.find((row) => row.type === 'website' && String(row.url ?? '') === url)
    requiredWebsites.push(prev ? { ...prev } : { type: 'website', url, crawled_at: fallbackTime })
  }

  const extraWebsites = existing.filter((row) => {
    if (row.type !== 'website') return false
    const url = String(row.url ?? '').trim()
    return Boolean(url) && !seenUrls.has(url)
  })

  const requiredFiles: Record<string, unknown>[] = []
  const seenPaths = new Set<string>()
  for (const item of sources) {
    if (item.type !== 'file' || !item.library_path) continue
    const filePath = inputsPathFor(manifest, item.library_path)
    if (isBookmarkFilePath(filePath, bookmarkPaths, websiteLibraryPaths)) continue
    if (seenPaths.has(filePath)) continue
    seenPaths.add(filePath)
    const prev = existing.find(
      (row) => row.type === 'file' && slashPath(row.path) === filePath,
    )
    requiredFiles.push(
      prev ? { ...prev, path: filePath } : { type: 'file', path: filePath, uploaded_at: fallbackTime },
    )
  }

  const extraFiles = existing.filter((row) => {
    if (row.type !== 'file') return false
    const filePath = slashPath(row.path)
    if (!filePath || seenPaths.has(filePath)) return false
    return !isBookmarkFilePath(filePath, bookmarkPaths, websiteLibraryPaths)
  })

  const others = existing.filter(
    (row) => row.type && row.type !== 'website' && row.type !== 'file' && row.type !== 'manual',
  )

  return [...requiredWebsites, ...extraWebsites, ...requiredFiles, ...extraFiles, ...others]
}
