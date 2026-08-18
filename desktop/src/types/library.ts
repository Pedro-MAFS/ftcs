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

export interface LibraryTreeNode {
  name: string
  kind: 'dir' | 'file' | 'website'
  relativePath: string
  depth: number
  sizeBytes?: number
  modifiedAt?: string
  url?: string
  children: LibraryTreeNode[]
}

export interface LibrarySnapshot {
  websites: WebsiteItem[]
  /** 焦点目录，供新建/上传/粘贴；根为 '' */
  focusDir: string
  tree: LibraryTreeNode[]
  truncated: boolean
  filesRootLabel: string
  /** @deprecated I-01 起不再用于浏览；与 focusDir 相同 */
  cwd?: string
  entries?: FileEntry[]
}

export interface LibraryMutationResult {
  ok: boolean
  message: string
  snapshot: LibrarySnapshot
  imported?: number
  dirsCreated?: number
  skipped?: string[]
  createdPath?: string
}
