import type { LibraryTreeNode } from '../../types/library'

export interface ExpandGenerateResult {
  folderPaths: string[]
  filePaths: string[]
  websitePaths: string[]
  needsConfirm: boolean
  confirmMessage: string
  empty: boolean
}

function indexTree(nodes: LibraryTreeNode[], map = new Map<string, LibraryTreeNode>()) {
  for (const node of nodes) {
    map.set(node.relativePath, node)
    if (node.children.length) indexTree(node.children, map)
  }
  return map
}

function isUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}

function outermostFolders(paths: string[]): string[] {
  const unique = [...new Set(paths.filter(Boolean))].sort()
  return unique.filter(
    (path) => !unique.some((other) => other !== path && isUnder(path, other)),
  )
}

function collectLeaves(node: LibraryTreeNode): { files: string[]; websites: string[] } {
  const files: string[] = []
  const websites: string[] = []
  function walk(current: LibraryTreeNode) {
    if (current.kind === 'file') files.push(current.relativePath)
    if (current.kind === 'website') websites.push(current.relativePath)
    for (const child of current.children) walk(child)
  }
  for (const child of node.children) walk(child)
  return { files, websites }
}

function hasChildDir(node: LibraryTreeNode): boolean {
  return node.children.some((child) => child.kind === 'dir')
}

function countLabel(files: number, websites: number): string {
  const parts: string[] = []
  if (files) parts.push(`${files} 个文件`)
  if (websites) parts.push(`${websites} 个网站`)
  return parts.join('，') || '无资料'
}

function buildConfirmMessage(
  folders: Array<{ path: string; files: number; websites: number }>,
  extras: string[],
  fileTotal: number,
  websiteTotal: number,
): string {
  const lines = ['将把以下资料合并成一份画像（不会按文件夹各出一份）：', '']
  for (const folder of folders) {
    lines.push(`文件夹 ${folder.path}（${countLabel(folder.files, folder.websites)}）`)
  }
  if (extras.length) lines.push(`另选 ${extras.join('、')}`)
  lines.push('')
  lines.push(`合计 ${fileTotal} 个文件、${websiteTotal} 个网站。取消则不生成。`)
  return lines.join('\n')
}

export function expandGenerateSelection(
  tree: LibraryTreeNode[],
  selectedIds: ReadonlySet<string>,
): ExpandGenerateResult {
  const byPath = indexTree(tree)
  const selectedDirs: LibraryTreeNode[] = []
  const selectedFiles: LibraryTreeNode[] = []
  const selectedSites: LibraryTreeNode[] = []

  for (const id of selectedIds) {
    const node = byPath.get(id)
    if (!node) continue
    if (node.kind === 'dir') selectedDirs.push(node)
    else if (node.kind === 'file') selectedFiles.push(node)
    else if (node.kind === 'website') selectedSites.push(node)
  }

  const folderPaths = outermostFolders(selectedDirs.map((node) => node.relativePath))
  const folderNodes = folderPaths
    .map((rel) => byPath.get(rel))
    .filter((node): node is LibraryTreeNode => Boolean(node))

  const fileSet = new Set<string>()
  const siteSet = new Set<string>()
  for (const node of selectedFiles) fileSet.add(node.relativePath)
  for (const node of selectedSites) siteSet.add(node.relativePath)

  const folderStats: Array<{ path: string; files: number; websites: number }> = []
  for (const folder of folderNodes) {
    const leaves = collectLeaves(folder)
    for (const rel of leaves.files) fileSet.add(rel)
    for (const rel of leaves.websites) siteSet.add(rel)
    folderStats.push({
      path: folder.relativePath,
      files: leaves.files.length,
      websites: leaves.websites.length,
    })
  }

  const extras: string[] = []
  for (const node of [...selectedFiles, ...selectedSites]) {
    if (!folderPaths.some((folder) => isUnder(node.relativePath, folder))) {
      extras.push(node.relativePath)
    }
  }

  const filePaths = [...fileSet].sort()
  const websitePaths = [...siteSet].sort()
  const needsConfirm =
    folderPaths.length >= 2 || folderNodes.some((node) => hasChildDir(node))

  return {
    folderPaths,
    filePaths,
    websitePaths,
    needsConfirm,
    confirmMessage: buildConfirmMessage(folderStats, extras, filePaths.length, websitePaths.length),
    empty: filePaths.length === 0 && websitePaths.length === 0,
  }
}
