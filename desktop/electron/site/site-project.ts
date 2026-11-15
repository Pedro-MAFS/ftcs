import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type SiteStatus = 'not_created' | 'empty' | 'existing' | 'ready' | 'missing' | 'invalid' | 'error'
export interface SiteSnapshot {
  status: SiteStatus
  workspaceRoot: string
  projectPath: string
  message: string
  dependencies: 'missing' | 'unknown'
}
type SiteRecord = { version: 1; projectDir: 'website'; buildOutputDir: string | null; createdAt?: string; [key: string]: unknown }

function recordPath(root: string): string { return path.join(root, '.ftcs', 'site.json') }
function readRecord(root: string): { record: SiteRecord | null; damaged: boolean } {
  const file = recordPath(root)
  try {
    const dir = fs.lstatSync(path.dirname(file))
    if (!dir.isDirectory() || dir.isSymbolicLink()) return { record: null, damaged: true }
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) return { record: null, damaged: true }
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as SiteRecord
    if (!record || typeof record !== 'object' || record.version !== 1 || record.projectDir !== 'website' || !(record.buildOutputDir === null || typeof record.buildOutputDir === 'string')) return { record: null, damaged: true }
    return { record, damaged: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { record: null, damaged: false }
    if (error instanceof SyntaxError) return { record: null, damaged: true }
    throw error
  }
}

function writeRecord(root: string, record: SiteRecord): void {
  const dir = path.join(root, '.ftcs')
  fs.mkdirSync(dir, { recursive: true })
  const stat = fs.lstatSync(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('工作区 .ftcs 目录不可用，请检查目录。')
  const target = recordPath(root)
  try {
    const existing = fs.lstatSync(target)
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('站点记录不是普通文件，请检查工作区 .ftcs 目录。')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temp = path.join(dir, `.site-${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temp, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, target)
  } finally {
    try { fs.unlinkSync(temp) } catch { /* no temporary file */ }
  }
}

function validPackage(projectPath: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'))
    return typeof pkg?.scripts?.dev === 'string' && !!pkg.scripts.dev.trim() && typeof pkg?.scripts?.build === 'string' && !!pkg.scripts.build.trim()
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'EISDIR') return false
    throw error
  }
}

export function getSiteSnapshot(workspaceRoot: string): SiteSnapshot {
  const root = path.resolve(workspaceRoot)
  const projectPath = path.join(root, 'website')
  const snapshot = (status: SiteStatus, message: string, dependencies: SiteSnapshot['dependencies'] = 'unknown'): SiteSnapshot => ({ status, workspaceRoot: root, projectPath, message, dependencies })
  try {
    const rootStat = fs.statSync(root)
    if (!rootStat.isDirectory()) return snapshot('error', '工作区不是有效目录。')
    fs.accessSync(root, fs.constants.R_OK)
    const { record, damaged } = readRecord(root)
    let stat: fs.Stats
    try { stat = fs.lstatSync(projectPath) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (record || damaged) return snapshot('missing', damaged ? '站点记录损坏且目录不存在，请检查工作区。' : '站点目录不存在，可恢复原目录或重新创建。')
      return snapshot('not_created', '当前工作区尚未创建站点。')
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) return snapshot('error', '站点路径不是普通目录，或是符号链接，请检查工作区。')
    fs.accessSync(projectPath, fs.constants.R_OK)
    if (fs.readdirSync(projectPath).length === 0) return snapshot('empty', '站点目录为空，可在此初始化。')
    if (!validPackage(projectPath)) return snapshot('invalid', '站点项目不完整或 package.json 缺少 dev、build 脚本，请检查目录。')
    const dependencies = fs.existsSync(path.join(projectPath, 'node_modules')) ? 'unknown' : 'missing'
    if (!record || damaged) return snapshot('existing', damaged ? '站点记录损坏，发现可接管的项目。' : '发现已有站点项目，可选择使用。', dependencies)
    return snapshot('ready', '本地站点已创建。', dependencies)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return snapshot('error', code === 'ENOENT' ? '工作区不存在，请检查工作区位置。' : code === 'EACCES' || code === 'EPERM' ? '没有权限读取站点或工作区。' : `无法读取站点：${error instanceof Error ? error.message : String(error)}`)
  }
}

function copyTemplate(source: string, target: string): void {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(to)
      copyTemplate(from, to)
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL)
    } else throw new Error('站点模板包含不支持的文件类型。')
  }
}

export function createSite(workspaceRoot: string, templatePath: string): SiteSnapshot {
  const root = path.resolve(workspaceRoot)
  const current = getSiteSnapshot(root)
  if (!['not_created', 'empty', 'missing'].includes(current.status)) throw new Error('站点状态已变化，请刷新后重试。')
  const previous = readRecord(root)
  if (current.status === 'empty') {
    if (fs.readdirSync(current.projectPath).length !== 0 || fs.lstatSync(current.projectPath).isSymbolicLink()) throw new Error('站点目录已变化，请刷新后重试。')
  } else {
    fs.mkdirSync(current.projectPath)
  }
  copyTemplate(templatePath, current.projectPath)
  // Never overwrite files in a partially created project on a retry.
  if (!validPackage(current.projectPath)) throw new Error('模板不完整，请检查站点目录。')
  writeRecord(root, previous.record ?? { version: 1, projectDir: 'website', buildOutputDir: 'dist', createdAt: new Date().toISOString() })
  return getSiteSnapshot(root)
}

export function adoptSite(workspaceRoot: string): SiteSnapshot {
  const root = path.resolve(workspaceRoot)
  const current = getSiteSnapshot(root)
  if (current.status !== 'existing') throw new Error('站点状态已变化，请刷新后重试。')
  writeRecord(root, { version: 1, projectDir: 'website', buildOutputDir: null })
  return getSiteSnapshot(root)
}

/** The build destination is always a subdirectory of the current project. */
export function resolveSiteOutput(projectPath: string, relative: string): string {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error('产物目录必须是站点内的相对路径。')
  const parts = relative.trim().split(/[\\/]+/)
  if (parts.some(part => part === '..' || part === '.' || !part || part.includes(':'))) throw new Error('产物目录不能包含上级路径。')
  let current = projectPath
  for (const part of parts) {
    current = path.join(current, part)
    try {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('产物目录必须是站点内的普通目录。')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return current
}

export function getSiteOutput(root: string): string | null {
  return readRecord(path.resolve(root)).record?.buildOutputDir ?? null
}

export function setSiteOutput(root: string, relative: string): void {
  root = path.resolve(root)
  if (getSiteSnapshot(root).status !== 'ready') throw new Error('站点不可用，请先检查项目。')
  const record = readRecord(root).record
  if (!record) throw new Error('站点配置不可用。')
  resolveSiteOutput(path.join(root, 'website'), relative)
  writeRecord(root, { ...record, buildOutputDir: relative.trim().replace(/\\/g, '/') })
}
