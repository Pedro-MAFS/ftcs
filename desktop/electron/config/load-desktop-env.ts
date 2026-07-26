import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnvFile } from './env-file'

/**
 * 将 desktop/.env* 中尚未出现在 process.env 的键写入进程环境。
 * 加载顺序对齐 Vite：.env → .env.local → .env.[mode] → .env.[mode].local（后者覆盖前者）。
 * electron-vite 默认只把 VITE_/MAIN_VITE_ 等前缀注入 import.meta.env，
 * 不会把 FTCS_* 放进 process.env，因此主进程需自行加载。
 */
export function loadDesktopEnvFile(): void {
  const root = resolveDesktopRoot()
  if (!root) return

  const mode =
    process.env.MODE?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')

  const merged: Record<string, string> = {}
  for (const name of [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]) {
    const envPath = path.join(root, name)
    if (!fs.existsSync(envPath)) continue
    Object.assign(merged, parseEnvFile(fs.readFileSync(envPath, 'utf8')))
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function resolveDesktopRoot(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.cwd(),
    path.resolve(here, '../..'), // electron/config → desktop
    path.resolve(here, '../../..'), // out/main → desktop
  ]
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, '.env')) ||
      fs.existsSync(path.join(dir, '.env.development')) ||
      fs.existsSync(path.join(dir, '.env.example')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir
    }
  }
  return null
}
