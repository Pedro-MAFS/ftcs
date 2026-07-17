import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { loadExpansion, type KeywordExpansion } from '../keywords/keywords-reader'

export type ExploreTaskStatus =
  | 'keywords_ready'
  | 'running'
  | 'completed'
  | 'failed'

export interface ExploreTask {
  id: string
  productId: string
  status: ExploreTaskStatus
  title: string
  subtitle: string
  startedAt?: string
  finishedAt?: string | null
  totalQueries: number
  queriesExecuted: number
  leadsFound: number
  leadsAfterDedupe?: number
  rounds: string[]
  dimensionCounts: Array<{ key: string; label: string; count: number }>
  sampleQueries: string[]
  expansionPath?: string
  runPath?: string
}

const DIM_LABELS: Record<string, string> = {
  product: '产品',
  scenario: '场景',
  buyer: '买家',
  geo: '地理',
  competitor: '竞品',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getRunsDir(productId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'exploration', productId, 'runs')
}

function dimensionCountsFromExpansion(
  expansion: KeywordExpansion,
): Array<{ key: string; label: string; count: number }> {
  const byDim = expansion.stats.by_dimension
  const keys: Array<keyof KeywordExpansion['dimensions']> = [
    'product',
    'scenario',
    'buyer',
    'geo',
    'competitor',
  ]
  return keys.map((key) => {
    const fromStats = byDim?.[key]
    const fromDims = expansion.dimensions[key]?.length ?? 0
    const fromQueries = expansion.search_queries.filter((q) => q.dimension === key)
      .length
    const count =
      typeof fromStats === 'number' && fromStats > 0
        ? fromStats
        : fromDims || fromQueries
    return { key, label: DIM_LABELS[key] || key, count }
  })
}

function formatTimeLabel(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function keywordsReadyTask(expansion: KeywordExpansion): ExploreTask {
  const total = expansion.stats.total_queries
  const timeLabel = formatTimeLabel(expansion.generated_at)
  return {
    id: `kw_${expansion.product_id}`,
    productId: expansion.product_id,
    status: 'keywords_ready',
    title: '关键词扩展',
    subtitle: timeLabel
      ? `expand-keywords 已完成 · ${timeLabel}`
      : 'expand-keywords 已完成，可开始 R1 探索',
    startedAt: expansion.generated_at,
    finishedAt: expansion.generated_at,
    totalQueries: total,
    queriesExecuted: 0,
    leadsFound: 0,
    rounds: ['R1'],
    dimensionCounts: dimensionCountsFromExpansion(expansion),
    sampleQueries: expansion.search_queries
      .slice(0, 5)
      .map((q) => q.query)
      .filter(Boolean),
    expansionPath: `data/keywords/${expansion.product_id}/expansion.json`,
  }
}

function runToTask(
  raw: Record<string, unknown>,
  productId: string,
  expansion: KeywordExpansion | null,
): ExploreTask {
  const statusRaw = String(raw.status || 'completed')
  const status: ExploreTaskStatus =
    statusRaw === 'running'
      ? 'running'
      : statusRaw === 'failed'
        ? 'failed'
        : 'completed'

  const queriesExecuted =
    typeof raw.queries_executed === 'number' ? raw.queries_executed : 0
  const leadsFound = typeof raw.leads_found === 'number' ? raw.leads_found : 0
  const leadsAfterDedupe =
    typeof raw.leads_after_dedupe === 'number' ? raw.leads_after_dedupe : undefined
  const totalQueries = expansion?.stats.total_queries ?? queriesExecuted
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map(String) : ['R1']
  const id = String(raw.id || 'run_unknown')
  const startedAt = raw.started_at ? String(raw.started_at) : undefined
  const finishedAt =
    raw.finished_at == null ? null : String(raw.finished_at)

  let subtitle = ''
  if (status === 'running') {
    subtitle = `已执行 ${queriesExecuted}/${totalQueries || '—'} 条搜索词`
  } else if (status === 'failed') {
    subtitle = '探索失败，可查看 Agent 日志'
  } else {
    const after = leadsAfterDedupe != null ? ` · 去重后 ${leadsAfterDedupe}` : ''
    subtitle = `执行 ${queriesExecuted} 词 · 线索 ${leadsFound}${after}`
  }

  return {
    id,
    productId,
    status,
    title: rounds.join('+') || '探索任务',
    subtitle,
    startedAt,
    finishedAt,
    totalQueries,
    queriesExecuted,
    leadsFound,
    leadsAfterDedupe,
    rounds,
    dimensionCounts: expansion ? dimensionCountsFromExpansion(expansion) : [],
    sampleQueries: [],
    runPath: `data/exploration/${productId}/runs/${id}.json`,
    expansionPath: expansion
      ? `data/keywords/${productId}/expansion.json`
      : undefined,
  }
}

function listRuns(
  productId: string,
  workspaceRoot: string,
): Record<string, unknown>[] {
  const dir = getRunsDir(productId, workspaceRoot)
  if (!fs.existsSync(dir)) return []
  const out: Array<{ mtime: number; raw: Record<string, unknown> }> = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const filePath = path.join(dir, name)
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
        string,
        unknown
      >
      const st = fs.statSync(filePath)
      out.push({ mtime: st.mtimeMs, raw })
    } catch {
      // skip broken
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out.map((x) => x.raw)
}

export interface ExploreTasksSnapshot {
  productId: string
  companyName?: string
  tasks: ExploreTask[]
  summary: {
    total: number
    keywordsReady: number
    running: number
    completed: number
    failed: number
  }
  expansion: KeywordExpansion | null
}

export function listExploreTasks(
  productId: string,
  options?: { workspaceRoot?: string; companyName?: string },
): ExploreTasksSnapshot {
  const workspaceRoot = options?.workspaceRoot ?? getWorkspaceRoot()
  const expansion = loadExpansion(productId, workspaceRoot)
  const runs = listRuns(productId, workspaceRoot)
  const tasks: ExploreTask[] = []

  if (expansion) {
    tasks.push(keywordsReadyTask(expansion))
  }

  for (const raw of runs) {
    const rec = asRecord(raw)
    if (!rec) continue
    tasks.push(runToTask(rec, productId, expansion))
  }

  const summary = {
    total: tasks.length,
    keywordsReady: tasks.filter((t) => t.status === 'keywords_ready').length,
    running: tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }

  return {
    productId,
    companyName: options?.companyName,
    tasks,
    summary,
    expansion,
  }
}
