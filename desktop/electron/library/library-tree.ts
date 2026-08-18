import fs from 'node:fs'
import path from 'node:path'
import { readWebsiteBookmark } from './library-website'

export const TREE_MAX_NODES = 5000
export const TREE_MAX_DEPTH = 16

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

export interface ListFilesTreeOptions {
  maxNodes?: number
  maxDepth?: number
}

export interface ListFilesTreeResult {
  tree: LibraryTreeNode[]
  truncated: boolean
}

function filesRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'library', 'files')
}

export function parentDir(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function nextFocusAfterDelete(deletedRel: string, focusDir: string): string {
  const deleted = deletedRel.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const focus = focusDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!focus) return ''
  if (focus === deleted || focus.startsWith(`${deleted}/`)) {
    return parentDir(deleted)
  }
  return focus
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rootResolved = path.resolve(root)
  const resolved = path.resolve(candidate)
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
}

function isSafeNode(root: string, full: string): boolean {
  if (!isInsideRoot(root, full)) return false
  try {
    const st = fs.lstatSync(full)
    if (st.isSymbolicLink()) {
      const real = fs.realpathSync(full)
      return isInsideRoot(root, real)
    }
    return true
  } catch {
    return false
  }
}

function sortDirents(a: fs.Dirent, b: fs.Dirent): number {
  const aDir = a.isDirectory() ? 0 : 1
  const bDir = b.isDirectory() ? 0 : 1
  if (aDir !== bDir) return aDir - bDir
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, '/')
}

function walkDir(
  root: string,
  abs: string,
  rel: string,
  depth: number,
  ctx: { count: number; truncated: boolean; maxNodes: number; maxDepth: number },
): LibraryTreeNode[] {
  if (depth > ctx.maxDepth) {
    ctx.truncated = true
    return []
  }

  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }

  dirents.sort(sortDirents)
  const nodes: LibraryTreeNode[] = []

  for (const dirent of dirents) {
    if (dirent.name === '.' || dirent.name === '..') continue
    if (ctx.count >= ctx.maxNodes) {
      ctx.truncated = true
      break
    }

    const full = path.join(abs, dirent.name)
    if (dirent.name.includes('..') || !isSafeNode(root, full)) continue

    const entryRel = rel ? `${rel}/${dirent.name}` : toRel(root, full)
    let st: fs.Stats
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }

    if (st.isDirectory()) {
      ctx.count += 1
      let children: LibraryTreeNode[] = []
      if (depth >= ctx.maxDepth) {
        ctx.truncated = true
      } else {
        children = walkDir(root, full, entryRel, depth + 1, ctx)
      }
      nodes.push({
        name: dirent.name,
        kind: 'dir',
        relativePath: entryRel,
        depth,
        modifiedAt: st.mtime.toISOString(),
        children,
      })
    } else if (st.isFile()) {
      ctx.count += 1
      const bookmark = readWebsiteBookmark(full)
      if (bookmark) {
        nodes.push({
          name: bookmark.title,
          kind: 'website',
          relativePath: entryRel,
          depth,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
          url: bookmark.url,
          children: [],
        })
      } else {
        nodes.push({
          name: dirent.name,
          kind: 'file',
          relativePath: entryRel,
          depth,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
          children: [],
        })
      }
    }
  }

  return nodes
}

export function listFilesTree(
  workspaceRoot: string,
  options: ListFilesTreeOptions = {},
): ListFilesTreeResult {
  const maxNodes = options.maxNodes ?? TREE_MAX_NODES
  const maxDepth = options.maxDepth ?? TREE_MAX_DEPTH
  const root = filesRoot(workspaceRoot)
  fs.mkdirSync(root, { recursive: true })

  const ctx = { count: 0, truncated: false, maxNodes, maxDepth }
  const tree = walkDir(root, root, '', 1, ctx)
  return { tree, truncated: ctx.truncated }
}

export function collectFilePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'file') out.push(node.relativePath)
    if (node.children.length) out.push(...collectFilePaths(node.children))
  }
  return out
}

export function collectWebsitePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'website') out.push(node.relativePath)
    if (node.children.length) out.push(...collectWebsitePaths(node.children))
  }
  return out
}

export function collectDirPaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'dir') {
      out.push(node.relativePath)
      if (node.children.length) out.push(...collectDirPaths(node.children))
    }
  }
  return out
}

export function flattenEntries(nodes: LibraryTreeNode[]): Array<{
  name: string
  kind: 'dir' | 'file'
  relativePath: string
  sizeBytes?: number
  modifiedAt?: string
}> {
  const out: Array<{
    name: string
    kind: 'dir' | 'file'
    relativePath: string
    sizeBytes?: number
    modifiedAt?: string
  }> = []
  for (const node of nodes) {
    out.push({
      name: node.name,
      kind: node.kind === 'dir' ? 'dir' : 'file',
      relativePath: node.relativePath,
      sizeBytes: node.sizeBytes,
      modifiedAt: node.modifiedAt,
    })
    if (node.children.length) out.push(...flattenEntries(node.children))
  }
  return out
}

export function resolveExistingFocusDir(tree: LibraryTreeNode[], focusDir: string): string {
  const normalized = (focusDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalized) return ''
  return collectDirPaths(tree).includes(normalized) ? normalized : ''
}
