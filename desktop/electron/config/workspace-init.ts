import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { readEnvFile, upsertEnvFile } from './env-file'
import { getRepoRoot } from './paths'

/**
 * 模板版本：改动标准 workspace 中 skills/mcp/config 结构时递增，
 * 启动时若目标区标记版本落后，会重新同步托管目录。
 */
export const WORKSPACE_TEMPLATE_VERSION = '2026.07.21-runtime-bootstrap'

/** 始终从模板覆盖同步（用户业务数据不在此列） */
export const MANAGED_WORKSPACE_DIRS = ['skills', 'mcp-servers', 'config'] as const

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.opencode',
  '.cursor',
  'logs',
])

export interface WorkspaceInitResult {
  targetRoot: string
  templateRoot: string
  skipped: boolean
  reason: string
  syncedManaged: string[]
  createdBootstrap: string[]
  mcpBuildAttempted: boolean
}

/** 标准工作流模板根目录（只读源；运行时工作区见 getWorkspaceRoot） */
export function getWorkspaceTemplateRoot(): string {
  if (process.env.FTCS_WORKSPACE_TEMPLATE) {
    return path.resolve(process.env.FTCS_WORKSPACE_TEMPLATE)
  }
  // 打包：随应用分发的模板；开发：仓库内标准 workspace（仅作复制源）
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'workspace-template')
  }
  return path.join(getRepoRoot(), 'workspace')
}

function markerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.ftcs', 'workspace-sync.json')
}

function readSyncMarker(workspaceRoot: string): { version?: string } | null {
  const file = markerPath(workspaceRoot)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }
  } catch {
    return null
  }
}

function writeSyncMarker(workspaceRoot: string): void {
  const file = markerPath(workspaceRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        version: WORKSPACE_TEMPLATE_VERSION,
        syncedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a)
  const nb = path.resolve(b)
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase()
  }
  return na === nb
}

function copyDirFiltered(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue
    if (entry.name === '.env') continue

    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirFiltered(from, to)
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
    }
  }
}

function ensureDataSkeleton(workspaceRoot: string): string[] {
  const created: string[] = []
  const dirs = [
    'data/library/websites',
    'data/library/files',
    'data/products/_example/inputs',
    'data/keywords',
    'data/leads',
    'data/emails',
    'data/exploration',
    'data/cache/search',
    'logs/exploration',
  ]
  for (const dir of dirs) {
    const full = path.join(workspaceRoot, dir)
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true })
      created.push(dir)
    }
  }
  return created
}

function copyExampleProductIfMissing(templateRoot: string, workspaceRoot: string): string[] {
  const created: string[] = []
  const rel = path.join('data', 'products', '_example')
  const src = path.join(templateRoot, rel)
  const dest = path.join(workspaceRoot, rel)
  if (!fs.existsSync(src)) return created
  if (fs.existsSync(path.join(dest, 'profile.json'))) return created
  copyDirFiltered(src, dest)
  created.push(rel.replace(/\\/g, '/'))
  return created
}

function bootstrapEnvExample(templateRoot: string, workspaceRoot: string): string[] {
  const created: string[] = []
  // .env.example 始终与模板对齐（不含密钥）；.env / README 仅首次创建
  const exampleSrc = path.join(templateRoot, '.env.example')
  const exampleDest = path.join(workspaceRoot, '.env.example')
  if (fs.existsSync(exampleSrc)) {
    fs.copyFileSync(exampleSrc, exampleDest)
    created.push('.env.example')
  }

  const readmeSrc = path.join(templateRoot, 'README.md')
  const readmeDest = path.join(workspaceRoot, 'README.md')
  if (fs.existsSync(readmeSrc) && !fs.existsSync(readmeDest)) {
    fs.copyFileSync(readmeSrc, readmeDest)
    created.push('README.md')
  }

  const envPath = path.join(workspaceRoot, '.env')
  if (!fs.existsSync(envPath) && fs.existsSync(exampleDest)) {
    fs.copyFileSync(exampleDest, envPath)
    created.push('.env')
  }
  return created
}

/**
 * 一次性迁移：旧版把 model 写在 opencode.json，模板同步前先落到 .env，避免被覆盖丢失。
 */
function migrateModelPrefsToEnv(workspaceRoot: string): string[] {
  const configPath = path.join(workspaceRoot, 'config', 'opencode', 'opencode.json')
  const envPath = path.join(workspaceRoot, '.env')
  if (!fs.existsSync(configPath)) return []

  let config: Record<string, unknown>
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch {
    return []
  }

  const env = readEnvFile(envPath)
  const updates: Record<string, string> = {}

  if (!env.FTCS_MODEL && typeof config.model === 'string' && config.model.trim()) {
    updates.FTCS_MODEL = config.model.trim()
  }
  if (
    !env.FTCS_SMALL_MODEL &&
    typeof config.small_model === 'string' &&
    config.small_model.trim()
  ) {
    updates.FTCS_SMALL_MODEL = config.small_model.trim()
  }
  if (!env.FTCS_CHANNEL_MODE && !env.FTCS_PROVIDER_ID && updates.FTCS_MODEL) {
    // 旧版自备 Key 配置：落入自定义通道，交给后续 migrate 读全量 env
    updates.FTCS_CHANNEL_MODE = 'custom'
    const model = updates.FTCS_MODEL
    if (model.startsWith('deepseek/')) updates.FTCS_PROVIDER_ID = 'deepseek'
    else if (model.startsWith('anthropic/')) updates.FTCS_PROVIDER_ID = 'anthropic'
    else if (model.startsWith('openai/')) updates.FTCS_PROVIDER_ID = 'openai'
    else if (model.startsWith('google/') || model.startsWith('gemini/')) {
      updates.FTCS_PROVIDER_ID = 'google'
    } else if (model.startsWith('custom/')) updates.FTCS_PROVIDER_ID = 'custom'
  }

  if (Object.keys(updates).length === 0) return []
  upsertEnvFile(envPath, updates)
  Object.assign(process.env, updates)
  return Object.keys(updates)
}

/**
 * 同步 opencode.json：纯模板覆盖。
 * 用户模型/密钥等偏好在 .env，不在此文件中，避免模板更新冲掉用户设置。
 */
function syncOpencodeConfig(templateRoot: string, workspaceRoot: string): void {
  const src = path.join(templateRoot, 'config', 'opencode', 'opencode.json')
  const dest = path.join(workspaceRoot, 'config', 'opencode', 'opencode.json')
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function syncManagedDir(
  templateRoot: string,
  workspaceRoot: string,
  dirName: string,
): boolean {
  const src = path.join(templateRoot, dirName)
  const dest = path.join(workspaceRoot, dirName)
  if (!fs.existsSync(src)) return false

  if (dirName === 'config') {
    // config：整目录覆盖；opencode.json 始终用模板（用户偏好在 .env）
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    copyDirFiltered(src, dest)
    syncOpencodeConfig(templateRoot, workspaceRoot)
    return true
  }

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  copyDirFiltered(src, dest)
  return true
}

function needsManagedSync(workspaceRoot: string, force: boolean): boolean {
  if (force) return true
  const marker = readSyncMarker(workspaceRoot)
  if (!marker || marker.version !== WORKSPACE_TEMPLATE_VERSION) return true
  // 关键资产缺失也视为需要初始化
  for (const dir of MANAGED_WORKSPACE_DIRS) {
    if (!fs.existsSync(path.join(workspaceRoot, dir))) return true
  }
  if (!fs.existsSync(path.join(workspaceRoot, 'config', 'opencode', 'opencode.json'))) {
    return true
  }
  // 预打包 MCP 入口缺失 → 重新同步
  const mcpRoot = path.join(workspaceRoot, 'mcp-servers')
  if (fs.existsSync(mcpRoot)) {
    for (const name of fs.readdirSync(mcpRoot)) {
      const pkgJson = path.join(mcpRoot, name, 'package.json')
      if (!fs.existsSync(pkgJson)) continue
      if (!fs.existsSync(path.join(mcpRoot, name, 'dist', 'mcp.js'))) return true
    }
  }
  return false
}

/**
 * 初始化 / 同步工作区：
 * - 目标误指向模板本身：只补数据骨架，避免把模板目录当用户区改写
 * - 否则：同步 skills / mcp-servers / config；引导 .env；保留用户 data 与已有 .env
 */
export function initializeWorkspace(
  workspaceRoot: string,
  options?: { forceManaged?: boolean },
): WorkspaceInitResult {
  const templateRoot = getWorkspaceTemplateRoot()
  const target = path.resolve(workspaceRoot)
  fs.mkdirSync(target, { recursive: true })

  const createdBootstrap: string[] = []
  const syncedManaged: string[] = []

  if (!fs.existsSync(templateRoot)) {
    createdBootstrap.push(...ensureDataSkeleton(target))
    return {
      targetRoot: target,
      templateRoot,
      skipped: true,
      reason: `模板目录不存在: ${templateRoot}；仅创建数据骨架`,
      syncedManaged,
      createdBootstrap,
      mcpBuildAttempted: false,
    }
  }

  if (samePath(templateRoot, target)) {
    createdBootstrap.push(...ensureDataSkeleton(target))
    writeSyncMarker(target)
    return {
      targetRoot: target,
      templateRoot,
      skipped: true,
      reason: '工作区路径与模板相同，跳过复制（请改用独立工作目录）',
      syncedManaged,
      createdBootstrap,
      mcpBuildAttempted: false,
    }
  }

  // 模板覆盖 config 前，先把旧 opencode.json 里的模型迁到 .env
  const migrated = migrateModelPrefsToEnv(target)
  if (migrated.length) {
    createdBootstrap.push(`migrated:${migrated.join(',')}`)
  }

  const force = Boolean(options?.forceManaged)
  if (needsManagedSync(target, force)) {
    for (const dir of MANAGED_WORKSPACE_DIRS) {
      if (syncManagedDir(templateRoot, target, dir)) {
        syncedManaged.push(dir)
      }
    }
    writeSyncMarker(target)
  }

  createdBootstrap.push(...bootstrapEnvExample(templateRoot, target))
  createdBootstrap.push(...copyExampleProductIfMissing(templateRoot, target))
  createdBootstrap.push(...ensureDataSkeleton(target))

  return {
    targetRoot: target,
    templateRoot,
    skipped: false,
    reason:
      syncedManaged.length > 0
        ? `已同步托管目录: ${syncedManaged.join(', ')}`
        : '托管目录已是最新，仅补齐引导文件与数据骨架',
    syncedManaged,
    createdBootstrap,
    mcpBuildAttempted: false,
  }
}

async function runNpm(cwd: string, args: string[]): Promise<void> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    await execFileAsync(npmCmd, args, {
      cwd,
      windowsHide: true,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`在 ${cwd} 执行 ${npmCmd} ${args.join(' ')} 失败: ${detail}`)
  }
}

const MCP_BUNDLE_ENTRY = path.join('dist', 'mcp.js')

function mcpBundlePath(pkgDir: string): string {
  return path.join(pkgDir, MCP_BUNDLE_ENTRY)
}

/** 将模板源中的预打包产物拷到用户工作区对应包 */
function copyMcpBundleFromTemplate(
  templatePkgDir: string,
  workspacePkgDir: string,
): boolean {
  const from = mcpBundlePath(templatePkgDir)
  if (!fs.existsSync(from)) return false
  const to = mcpBundlePath(workspacePkgDir)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  // 同步 package.json，便于识别包名（可选但有助于排障）
  const pkgFrom = path.join(templatePkgDir, 'package.json')
  const pkgTo = path.join(workspacePkgDir, 'package.json')
  if (fs.existsSync(pkgFrom)) {
    fs.mkdirSync(workspacePkgDir, { recursive: true })
    fs.copyFileSync(pkgFrom, pkgTo)
  }
  return true
}

/**
 * 确保用户工作区具备预打包 MCP 入口（dist/mcp.js）。
 * - 已有产物：跳过
 * - 开发态缺失：在仓库模板源 install+build，再拷贝产物（不在用户区 npm install）
 * - 打包态缺失：报错（安装包应已含产物）
 */
export async function ensureMcpServersReady(
  workspaceRoot: string,
  log?: (line: string) => void,
): Promise<{ built: string[]; skipped: string[]; errors: string[] }> {
  const built: string[] = []
  const skipped: string[] = []
  const errors: string[] = []
  const root = path.join(workspaceRoot, 'mcp-servers')
  if (!fs.existsSync(root)) return { built, skipped, errors }

  const templateRoot = getWorkspaceTemplateRoot()
  const templateMcpRoot = path.join(templateRoot, 'mcp-servers')

  for (const name of fs.readdirSync(root)) {
    const pkgDir = path.join(root, name)
    const pkgJson = path.join(pkgDir, 'package.json')
    if (!fs.existsSync(pkgJson)) continue

    const entry = mcpBundlePath(pkgDir)
    if (fs.existsSync(entry)) {
      skipped.push(name)
      continue
    }

    const templatePkg = path.join(templateMcpRoot, name)
    const templateEntry = mcpBundlePath(templatePkg)

    // 模板里已有产物 → 只拷贝
    if (fs.existsSync(templateEntry)) {
      try {
        copyMcpBundleFromTemplate(templatePkg, pkgDir)
        if (fs.existsSync(entry)) {
          built.push(name)
          log?.(`MCP ${name}: 已从模板同步 dist/mcp.js`)
        } else {
          errors.push(`${name}: 模板产物拷贝失败`)
        }
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      continue
    }

    if (app.isPackaged) {
      errors.push(
        `${name}: 安装包缺少预打包产物 dist/mcp.js（请重新构建并打入 workspace-template）`,
      )
      continue
    }

    // 开发态：在模板源构建，再同步到用户工作区
    if (!fs.existsSync(path.join(templatePkg, 'package.json'))) {
      errors.push(`${name}: 模板源不存在 ${templatePkg}`)
      continue
    }

    try {
      log?.(`MCP ${name}: 开发态在模板源构建预打包产物…`)
      await runNpm(templatePkg, ['install'])
      await runNpm(templatePkg, ['run', 'build'])
      if (!fs.existsSync(templateEntry)) {
        errors.push(`${name}: 模板源 build 后仍缺少 dist/mcp.js`)
        continue
      }
      copyMcpBundleFromTemplate(templatePkg, pkgDir)
      if (fs.existsSync(entry)) {
        built.push(name)
        log?.(`MCP ${name}: 已构建并同步 dist/mcp.js`)
      } else {
        errors.push(`${name}: 构建后拷贝失败`)
      }
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { built, skipped, errors }
}
