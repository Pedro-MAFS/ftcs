import { app } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根（应用源码：desktop / docs / scripts；工作流在 workspace/） */
export function getRepoRoot(): string {
  if (process.env.FTCS_REPO_ROOT) {
    return path.resolve(process.env.FTCS_REPO_ROOT)
  }

  if (app.isPackaged) {
    // 打包后仓库源码不一定存在；资源与工作区分离
    return path.join(process.resourcesPath)
  }

  // electron-vite: out/main → desktop/out/main → repo root
  return path.resolve(__dirname, '..', '..', '..')
}

/**
 * OpenCode / MCP 运行时工作区（纯净目录：data、config、.env、skills 副本）。
 * 开发默认：<repo>/workspace
 * 打包默认：userData/workspace
 */
export function getWorkspaceRoot(): string {
  if (process.env.FTCS_WORKSPACE) {
    return path.resolve(process.env.FTCS_WORKSPACE)
  }

  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'workspace')
  }

  return path.join(getRepoRoot(), 'workspace')
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
