import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

export type ExplorationRunStatus = 'running' | 'completed' | 'failed'

export interface ExplorationRun {
  id: string
  product_id: string
  started_at: string
  finished_at: string | null
  status: ExplorationRunStatus
  rounds: string[]
  queries_executed: number
  leads_found: number
  leads_after_dedupe?: number
  api_usage: {
    search_calls: number
    crawl_pages: number
  }
  errors: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function getRunsDir(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'exploration', productId, 'runs')
}

export function getRunPath(
  productId: string,
  runId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(getRunsDir(productId, workspaceRoot), `${runId}.json`)
}

export function loadExplorationRun(
  productId: string,
  runId: string,
  workspaceRoot = getWorkspaceRoot(),
): ExplorationRun | null {
  const filePath = getRunPath(productId, runId, workspaceRoot)
  if (!fs.existsSync(filePath)) return null
  try {
    return parseRun(JSON.parse(fs.readFileSync(filePath, 'utf8')), productId)
  } catch {
    return null
  }
}

function parseRun(raw: Record<string, unknown>, fallbackProductId: string): ExplorationRun {
  const api = asRecord(raw.api_usage) ?? {}
  const statusRaw = String(raw.status || 'completed')
  const status: ExplorationRunStatus =
    statusRaw === 'running'
      ? 'running'
      : statusRaw === 'failed'
        ? 'failed'
        : 'completed'

  return {
    id: String(raw.id || ''),
    product_id: String(raw.product_id || fallbackProductId),
    started_at: String(raw.started_at || ''),
    finished_at: raw.finished_at == null ? null : String(raw.finished_at),
    status,
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map(String) : ['R1'],
    queries_executed:
      typeof raw.queries_executed === 'number' ? raw.queries_executed : 0,
    leads_found: typeof raw.leads_found === 'number' ? raw.leads_found : 0,
    leads_after_dedupe:
      typeof raw.leads_after_dedupe === 'number' ? raw.leads_after_dedupe : undefined,
    api_usage: {
      search_calls: typeof api.search_calls === 'number' ? api.search_calls : 0,
      crawl_pages: typeof api.crawl_pages === 'number' ? api.crawl_pages : 0,
    },
    errors: Array.isArray(raw.errors) ? raw.errors.map(String) : [],
  }
}

export function listExplorationRuns(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): ExplorationRun[] {
  const dir = getRunsDir(productId, workspaceRoot)
  if (!fs.existsSync(dir)) return []
  const out: ExplorationRun[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, name), 'utf8'),
      ) as Record<string, unknown>
      out.push(parseRun(raw, productId))
    } catch {
      // skip
    }
  }
  out.sort((a, b) => {
    const ta = Date.parse(a.started_at) || 0
    const tb = Date.parse(b.started_at) || 0
    return tb - ta
  })
  return out
}

/** 查找 afterIso 之后启动的最新探索 run */
export function findLatestRunAfter(
  productId: string,
  afterIso: string,
  workspaceRoot = getWorkspaceRoot(),
): ExplorationRun | null {
  const afterMs = Date.parse(afterIso) || 0
  const runs = listExplorationRuns(productId, workspaceRoot)
  for (const run of runs) {
    const started = Date.parse(run.started_at) || 0
    if (started >= afterMs - 2000) return run
  }
  return null
}

/**
 * 等待一次新的探索运行结束（completed / failed）。
 * 若尚无 run，会先等到 run 出现。
 */
export function waitForExplorationFinished(
  productId: string,
  options: {
    afterIso: string
    workspaceRoot?: string
    timeoutMs?: number
    intervalMs?: number
    signal?: AbortSignal
    onProgress?: (run: ExplorationRun) => void
  },
): Promise<ExplorationRun | null> {
  const workspaceRoot = options.workspaceRoot ?? getWorkspaceRoot()
  const timeoutMs = options.timeoutMs ?? 45 * 60_000
  const intervalMs = options.intervalMs ?? 2000
  const started = Date.now()
  let lastFingerprint = ''

  return new Promise((resolve) => {
    const tick = () => {
      if (options.signal?.aborted) {
        resolve(null)
        return
      }
      const run = findLatestRunAfter(productId, options.afterIso, workspaceRoot)
      if (run) {
        const fp = `${run.id}|${run.status}|${run.queries_executed}|${run.leads_found}`
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          options.onProgress?.(run)
        }
        if (run.status === 'completed' || run.status === 'failed') {
          resolve(run)
          return
        }
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(run)
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}
