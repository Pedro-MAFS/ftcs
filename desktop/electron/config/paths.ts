import { app } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readUserPrefs } from './user-prefs'

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
 * 运行时工作区（用户数据目录，与仓库模板分离）。
 * 优先级：环境变量 FTCS_WORKSPACE > 用户偏好 > `<userData>/workspace`
 *
 * 开发与打包行为一致：都不使用仓库根下的 `workspace/` 作为工作目录。
 * 仓库 `workspace/` 仅作标准模板，由 initializeWorkspace 同步进来。
 */
export function getWorkspaceRoot(): string {
  if (process.env.FTCS_WORKSPACE) {
    return path.resolve(process.env.FTCS_WORKSPACE)
  }

  const prefs = readUserPrefs()
  if (prefs.workspaceRoot) {
    return path.resolve(prefs.workspaceRoot)
  }

  return path.join(app.getPath('userData'), 'workspace')
}

export function getOpenCodeConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'config', 'opencode', 'opencode.json')
}

/**
 * OpenCode 全局配置隔离目录（作为 XDG_CONFIG_HOME）。
 * 当前 CLI 仍会合并 ~/.config/opencode；指向空目录可避免本机全局 MCP 渗入。
 */
export function getOpenCodeXdgConfigHome(): string {
  return path.join(app.getPath('userData'), 'opencode-xdg')
}

export function getDefaultOpenCodePort(): number {
  const raw = process.env.FTCS_OPENCODE_PORT
  if (raw) {
    const port = Number.parseInt(raw, 10)
    if (!Number.isNaN(port) && port > 0) return port
  }
  return 4096
}
