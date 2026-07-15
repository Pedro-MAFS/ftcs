import fs from 'node:fs'
import path from 'node:path'

/** 简易 .env 加载，供 Sidecar 子进程继承环境变量 */
export function loadWorkspaceEnv(workspaceRoot: string): NodeJS.ProcessEnv {
  const envPath = path.join(workspaceRoot, '.env')
  const merged: NodeJS.ProcessEnv = { ...process.env }

  if (!fs.existsSync(envPath)) {
    return merged
  }

  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    merged[key] = value
  }

  return merged
}

export function ensureWorkspaceDataDirs(workspaceRoot: string): void {
  const dirs = [
    'data/products/_example/inputs',
    'data/keywords',
    'data/leads',
    'data/emails',
    'data/exploration',
    'data/cache/search',
    'logs/exploration',
    '.opencode/skills',
  ]

  for (const dir of dirs) {
    fs.mkdirSync(path.join(workspaceRoot, dir), { recursive: true })
  }
}
