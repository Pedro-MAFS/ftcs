import { app } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（含 data/、skills/、mcp-servers/） */
export function getWorkspaceRoot(): string {
  if (process.env.FTCS_WORKSPACE) {
    return path.resolve(process.env.FTCS_WORKSPACE)
  }

  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'workspace')
  }

  // electron-vite dev/build: out/main → desktop/out/main → repo root = ../../..
  return path.resolve(__dirname, '..', '..', '..')
}

export function getOpenCodeConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'config', 'opencode', 'opencode.json')
}

export function getDefaultOpenCodePort(): number {
  const raw = process.env.FTCS_OPENCODE_PORT
  if (raw) {
    const port = Number.parseInt(raw, 10)
    if (!Number.isNaN(port) && port > 0) return port
  }
  return 4096
}
