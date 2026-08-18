import fs from 'node:fs'
import path from 'node:path'
import { TREE_MAX_DEPTH, TREE_MAX_NODES } from './library-tree'
import { sanitizeEntryName } from './library-name'

export interface ImportPathsResult {
  imported: number
  dirsCreated: number
  skipped: string[]
}

type ImportWalkCtx = ImportPathsResult & {
  count: number
  truncated: boolean
  filesRoot: string
  maxNodes: number
  maxDepth: number
}

function filesRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'library', 'files')
}

function importName(src: string): string {
  return sanitizeEntryName(path.basename(src)) || 'untitled'
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

function resolveUnderFiles(
  relativeDir: string,
  workspaceRoot: string,
): { root: string; abs: string } {
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

function isPathInside(parent: string, child: string): boolean {
  const p = path.resolve(parent)
  const c = path.resolve(child)
  return c === p || c.startsWith(p + path.sep)
}

export function collapseImportSources(paths: string[]): string[] {
  const unique = [...new Set(paths.filter(Boolean).map((p) => path.resolve(p)))]
  const dirs = unique.filter((p) => {
    try {
      return fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })
  return unique.filter((p) => !dirs.some((d) => p !== d && isPathInside(d, p)))
}

function skipReason(src: string, reason: string): string {
  return `${path.basename(src || 'unknown')}（${reason}）`
}

export function importFilesFromPaths(
  relativeDir: string,
  absolutePaths: string[],
  workspaceRoot: string,
  options?: { maxNodes?: number; maxDepth?: number },
): ImportPathsResult {
  if (!absolutePaths.length) return { imported: 0, dirsCreated: 0, skipped: [] }

  const { abs: destAbs, root } = resolveUnderFiles(relativeDir, workspaceRoot)
  fs.mkdirSync(destAbs, { recursive: true })
  const ctx: ImportWalkCtx = {
    imported: 0,
    dirsCreated: 0,
    skipped: [],
    count: 0,
    truncated: false,
    filesRoot: root,
    maxNodes: options?.maxNodes ?? TREE_MAX_NODES,
    maxDepth: options?.maxDepth ?? TREE_MAX_DEPTH,
  }

  for (const src of collapseImportSources(absolutePaths)) {
    if (ctx.truncated) break
    importOneSource(src, destAbs, ctx)
  }

  if (ctx.truncated) {
    ctx.skipped.push(
      `超过导入上限（${ctx.maxNodes} 个节点或深度 ${ctx.maxDepth}），其余未导入。请拆成更小的文件夹再试。`,
    )
  }

  return {
    imported: ctx.imported,
    dirsCreated: ctx.dirsCreated,
    skipped: ctx.skipped,
  }
}

function importOneSource(src: string, destAbs: string, ctx: ImportWalkCtx): void {
  if (!src || !fs.existsSync(src)) {
    ctx.skipped.push(skipReason(src, '找不到源文件'))
    return
  }

  if (isPathInside(ctx.filesRoot, src)) {
    ctx.skipped.push(skipReason(src, '不能从资料库内部导入'))
    return
  }
  if (isPathInside(src, ctx.filesRoot)) {
    ctx.skipped.push(skipReason(src, '所选文件夹包含当前资料库'))
    return
  }

  let st: fs.Stats
  try {
    st = fs.lstatSync(src)
  } catch {
    ctx.skipped.push(skipReason(src, '无权限或无法读取'))
    return
  }

  if (st.isSymbolicLink()) {
    ctx.skipped.push(skipReason(src, '跳过符号链接'))
    return
  }
  if (st.isFile()) {
    copyImportedFile(src, destAbs, ctx)
    return
  }
  if (st.isDirectory()) {
    importDirTree(src, destAbs, 1, ctx)
    return
  }
  ctx.skipped.push(skipReason(src, '不支持的类型'))
}

function copyImportedFile(src: string, destDir: string, ctx: ImportWalkCtx): void {
  if (ctx.count >= ctx.maxNodes) {
    ctx.truncated = true
    return
  }
  const name = importName(src)
  if (!name || name.includes('..')) {
    ctx.skipped.push(skipReason(src, '非法名称'))
    return
  }
  try {
    fs.mkdirSync(destDir, { recursive: true })
    const dest = uniquePath(destDir, name)
    fs.copyFileSync(src, dest)
    ctx.count += 1
    ctx.imported += 1
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
    const reason =
      code === 'EACCES' || code === 'EPERM'
        ? '无权限或无法读取'
        : err instanceof Error
          ? err.message
          : String(err)
    ctx.skipped.push(skipReason(src, reason))
  }
}

function importDirTree(src: string, destParent: string, depth: number, ctx: ImportWalkCtx): void {
  if (depth > ctx.maxDepth) {
    ctx.truncated = true
    return
  }
  if (ctx.count >= ctx.maxNodes) {
    ctx.truncated = true
    return
  }

  const name = importName(src)
  if (!name || name.includes('..')) {
    ctx.skipped.push(skipReason(src, '非法名称'))
    return
  }

  let dest = path.join(destParent, name)
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).isFile()) {
      dest = uniquePath(destParent, name)
    }
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
      ctx.dirsCreated += 1
    } else if (!fs.statSync(dest).isDirectory()) {
      ctx.skipped.push(skipReason(src, '无法创建同名目录'))
      return
    }
  } catch {
    ctx.skipped.push(skipReason(src, '无权限或无法读取'))
    return
  }

  ctx.count += 1

  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(src, { withFileTypes: true })
  } catch {
    ctx.skipped.push(skipReason(src, '无权限或无法读取'))
    return
  }

  for (const dirent of dirents) {
    if (ctx.truncated || ctx.count >= ctx.maxNodes) {
      ctx.truncated = true
      break
    }
    if (dirent.name === '.' || dirent.name === '..') continue
    if (dirent.name.includes('..')) {
      ctx.skipped.push(skipReason(dirent.name, '非法名称'))
      continue
    }

    const full = path.join(src, dirent.name)
    try {
      if (dirent.isSymbolicLink() || fs.lstatSync(full).isSymbolicLink()) {
        ctx.skipped.push(skipReason(full, '跳过符号链接'))
        continue
      }
    } catch {
      ctx.skipped.push(skipReason(full, '无权限或无法读取'))
      continue
    }

    if (dirent.isDirectory()) {
      importDirTree(full, dest, depth + 1, ctx)
    } else if (dirent.isFile()) {
      copyImportedFile(full, dest, ctx)
    }
  }
}
