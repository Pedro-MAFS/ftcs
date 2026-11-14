import fs from 'node:fs'
import path from 'node:path'
import type { PermissionAsk } from './permission-gate'

export type SitePermissionDecision = { action: 'allow' | 'ask' | 'deny'; command?: string; directory?: string }
export type ToolCall = { tool: string; input: Record<string, unknown> }
const deny: SitePermissionDecision = { action: 'deny' }
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Reject traversal, links, hard-linked files and unprovable targets before replying to OpenCode. */
export function isSitePath(siteRoot: string, target: string, directory = false): boolean {
  if (!path.isAbsolute(target) || target.split(/[\\/]/).includes('..')) return false
  const root = path.resolve(siteRoot), resolved = path.resolve(target)
  const relative = path.relative(root, resolved)
  if ((!relative && !directory) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false
  try {
    const rootStat = fs.lstatSync(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false
    let cursor = root
    const parts = relative ? relative.split(path.sep) : []
    let missing = false
    for (let i = 0; i < parts.length; i++) {
      cursor = path.join(cursor, parts[i])
      if (missing) continue
      try {
        const stat = fs.lstatSync(cursor)
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) return false
        if (i < parts.length - 1 && !stat.isDirectory()) return false
        if (i === parts.length - 1 && directory && !stat.isDirectory()) return false
        if (i === parts.length - 1 && !directory && !stat.isFile()) return false
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
        if (directory) return false
        missing = true
      }
    }
    return true
  } catch { return false }
}

export function decideSitePermission(input: { ask: PermissionAsk; activeSession: string; activeRoot: string; currentRoot: string; toolCall?: ToolCall }): SitePermissionDecision {
  const { ask } = input
  const same = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  if (!input.activeSession || ask.sessionId !== input.activeSession || same(input.activeRoot) !== same(input.currentRoot)) return deny
  const site = path.join(input.currentRoot, 'website')
  const metadata = record(ask.metadata)
  if (!metadata) return deny
  const permission = ask.permission.toLowerCase()
  if (permission === 'edit') {
    const call = input.toolCall
    const tool = call?.tool.toLowerCase()
    if (!ask.callId || !call || !['edit', 'write', 'apply_patch'].includes(tool || '')) return deny
    const files = metadata.files
    let targets: string[]
    if (files !== undefined) {
      if (tool !== 'apply_patch' || typeof call.input.patchText !== 'string' || !Array.isArray(files) || !files.length || !Array.isArray(ask.patterns) || files.length !== ask.patterns.length) return deny
      targets = []
      for (const value of files) {
        const file = record(value)
        if (!file || typeof file.filePath !== 'string' || !['add', 'update', 'delete', 'move'].includes(String(file.type))) return deny
        targets.push(file.filePath)
        if (file.type === 'move') { if (typeof file.movePath !== 'string') return deny; targets.push(file.movePath) }
        else if (file.movePath != null) return deny
      }
    } else {
      const requested = call.input.filePath
      if (!['edit', 'write'].includes(tool || '') || typeof requested !== 'string' || typeof metadata.filepath !== 'string' || !Array.isArray(ask.patterns) || ask.patterns.length !== 1 || same(path.resolve(input.activeRoot, requested)) !== same(metadata.filepath)) return deny
      targets = [metadata.filepath]
    }
    return targets.every(target => isSitePath(site, target)) ? { action: 'allow' } : deny
  }
  return deny
}

/** Bash authorization is a user decision; workdir is optional and never a boundary. */
export function decideChatShellPermission(ask: PermissionAsk, call?: ToolCall): SitePermissionDecision {
  const tool = call?.tool.toLowerCase()
  const input = tool === 'bash' || tool === 'shell' ? call?.input : undefined
  const metadata = record(ask.metadata)
  const command = typeof input?.command === 'string' && input.command ? input.command : typeof metadata?.command === 'string' && metadata.command ? metadata.command : undefined
  const directory = typeof input?.workdir === 'string' && input.workdir ? input.workdir : undefined
  return { action: 'ask', ...(command ? { command } : {}), ...(directory ? { directory } : {}) }
}
