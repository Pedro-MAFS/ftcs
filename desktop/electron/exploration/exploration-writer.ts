import fs from 'node:fs'
import { getWorkspaceRoot } from '../config/paths'
import {
  findLatestRunAfter,
  getRunPath,
  loadExplorationRun,
  type ExplorationRun,
} from './exploration-reader'

/**
 * 将仍为 running 的探索 run 本地收尾为 failed（不经 MCP）。
 * 用于用户中止 / 会话结束但未 exploration_finish 等场景。
 */
export function markExplorationRunFailed(
  productId: string,
  runId: string,
  reason: string,
  workspaceRoot = getWorkspaceRoot(),
): ExplorationRun | null {
  const existing = loadExplorationRun(productId, runId, workspaceRoot)
  if (!existing) return null
  if (existing.status !== 'running') return existing

  const errors = [...existing.errors]
  const note = reason.trim()
  if (note && !errors.includes(note)) {
    errors.push(note)
  }

  const updated: ExplorationRun = {
    ...existing,
    status: 'failed',
    finished_at: new Date().toISOString(),
    errors,
  }

  const filePath = getRunPath(productId, runId, workspaceRoot)
  fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
  return updated
}

/** 将 afterIso 之后启动的、仍为 running 的最新 run 标为 failed */
export function failLatestRunningExploration(
  productId: string,
  afterIso: string,
  reason: string,
  workspaceRoot = getWorkspaceRoot(),
): ExplorationRun | null {
  const run = findLatestRunAfter(productId, afterIso, workspaceRoot)
  if (!run || run.status !== 'running') return run
  return markExplorationRunFailed(productId, run.id, reason, workspaceRoot)
}
