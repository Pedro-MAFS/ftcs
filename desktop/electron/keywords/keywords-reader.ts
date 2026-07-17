import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

export type KeywordDimension = 'product' | 'scenario' | 'buyer' | 'geo' | 'competitor'

export interface SearchQuery {
  id: string
  query: string
  dimension: KeywordDimension | string
  language: string
  priority: string
  round: string
}

export interface KeywordExpansion {
  product_id: string
  generated_at: string
  dimensions: Record<KeywordDimension, string[]>
  search_queries: SearchQuery[]
  stats: {
    total_queries: number
    by_round: Record<string, number>
    by_dimension?: Record<string, number>
  }
}

export function getExpansionPath(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'keywords', productId, 'expansion.json')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(String).filter(Boolean)
}

export function loadExpansion(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): KeywordExpansion | null {
  const filePath = getExpansionPath(productId, workspaceRoot)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const dims = asRecord(raw.dimensions) ?? {}
    const stats = asRecord(raw.stats) ?? {}
    const queriesRaw = Array.isArray(raw.search_queries) ? raw.search_queries : []
    const search_queries: SearchQuery[] = queriesRaw.map((item, index) => {
      const row = asRecord(item) ?? {}
      return {
        id: String(row.id || `q_${index + 1}`),
        query: String(row.query || ''),
        dimension: String(row.dimension || 'product'),
        language: String(row.language || 'en'),
        priority: String(row.priority || 'medium'),
        round: String(row.round || 'R1'),
      }
    })

    const byRound = asRecord(stats.by_round) ?? {}
    const byDimension = asRecord(stats.by_dimension) ?? undefined

    return {
      product_id: String(raw.product_id || productId),
      generated_at: String(raw.generated_at || ''),
      dimensions: {
        product: asStringArray(dims.product),
        scenario: asStringArray(dims.scenario),
        buyer: asStringArray(dims.buyer),
        geo: asStringArray(dims.geo),
        competitor: asStringArray(dims.competitor),
      },
      search_queries,
      stats: {
        total_queries:
          typeof stats.total_queries === 'number'
            ? stats.total_queries
            : search_queries.length,
        by_round: Object.fromEntries(
          Object.entries(byRound).map(([k, v]) => [k, Number(v) || 0]),
        ),
        by_dimension: byDimension
          ? Object.fromEntries(
              Object.entries(byDimension).map(([k, v]) => [k, Number(v) || 0]),
            )
          : undefined,
      },
    }
  } catch {
    return null
  }
}

/** 等待 expansion.json 写入，且 generated_at 晚于 afterIso（用于重复扩展） */
export function waitForExpansion(
  productId: string,
  options?: {
    workspaceRoot?: string
    afterIso?: string
    timeoutMs?: number
    intervalMs?: number
    signal?: AbortSignal
  },
): Promise<KeywordExpansion | null> {
  const workspaceRoot = options?.workspaceRoot ?? getWorkspaceRoot()
  const timeoutMs = options?.timeoutMs ?? 12 * 60_000
  const intervalMs = options?.intervalMs ?? 1500
  const afterMs = options?.afterIso ? Date.parse(options.afterIso) : 0
  const started = Date.now()

  return new Promise((resolve) => {
    const tick = () => {
      if (options?.signal?.aborted) {
        resolve(null)
        return
      }
      const expansion = loadExpansion(productId, workspaceRoot)
      if (expansion) {
        const genMs = Date.parse(expansion.generated_at)
        if (!afterMs || (Number.isFinite(genMs) && genMs >= afterMs - 1000)) {
          resolve(expansion)
          return
        }
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null)
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

const DIMENSIONS: KeywordDimension[] = [
  'product',
  'scenario',
  'buyer',
  'geo',
  'competitor',
]

const ROUNDS = new Set(['R1', 'R2', 'R3', 'R4'])
const PRIORITIES = new Set(['high', 'medium', 'low'])

export interface SaveExpansionInput {
  productId: string
  search_queries: Array<{
    id?: string
    query: string
    dimension: string
    language?: string
    priority?: string
    round?: string
  }>
  /** 若不传则按 search_queries 重建维度词表 */
  dimensions?: KeywordExpansion['dimensions']
}

export interface SaveExpansionResult {
  ok: boolean
  message: string
  expansion?: KeywordExpansion
}

function normalizeDimension(value: string): KeywordDimension {
  const key = value.trim().toLowerCase()
  if ((DIMENSIONS as string[]).includes(key)) return key as KeywordDimension
  return 'product'
}

function rebuildDimensions(
  queries: SearchQuery[],
  fallback?: KeywordExpansion['dimensions'],
): KeywordExpansion['dimensions'] {
  const next: KeywordExpansion['dimensions'] = {
    product: [],
    scenario: [],
    buyer: [],
    geo: [],
    competitor: [],
  }
  for (const q of queries) {
    const dim = normalizeDimension(String(q.dimension))
    const text = q.query.trim()
    if (!text) continue
    if (!next[dim].includes(text)) next[dim].push(text)
  }
  // 若某维为空且有旧数据，保留旧词（避免误删维度摘要）
  if (fallback) {
    for (const dim of DIMENSIONS) {
      if (next[dim].length === 0 && fallback[dim]?.length) {
        next[dim] = [...fallback[dim]]
      }
    }
  }
  return next
}

function buildStats(queries: SearchQuery[]): KeywordExpansion['stats'] {
  const by_round: Record<string, number> = {}
  const by_dimension: Record<string, number> = {}
  for (const q of queries) {
    by_round[q.round] = (by_round[q.round] ?? 0) + 1
    by_dimension[q.dimension] = (by_dimension[q.dimension] ?? 0) + 1
  }
  return {
    total_queries: queries.length,
    by_round,
    by_dimension,
  }
}

export function saveExpansion(input: SaveExpansionInput): SaveExpansionResult {
  const productId = input.productId?.trim()
  if (!productId) {
    return { ok: false, message: '缺少 productId' }
  }

  const existing = loadExpansion(productId)
  const cleaned: SearchQuery[] = []
  for (let index = 0; index < (input.search_queries ?? []).length; index++) {
    const row = input.search_queries[index]
    const query = String(row?.query || '').trim()
    if (!query) continue
    const roundRaw = String(row?.round || 'R1').toUpperCase()
    const round = ROUNDS.has(roundRaw) ? roundRaw : 'R1'
    const priorityRaw = String(row?.priority || 'medium').toLowerCase()
    const priority = PRIORITIES.has(priorityRaw) ? priorityRaw : 'medium'
    cleaned.push({
      id: String(row?.id || `q_${String(index + 1).padStart(3, '0')}`),
      query,
      dimension: normalizeDimension(String(row?.dimension || 'product')),
      language: String(row?.language || 'en').trim() || 'en',
      priority,
      round,
    })
  }

  if (cleaned.length === 0) {
    return { ok: false, message: '至少保留一条有效搜索词' }
  }

  // 确保 id 唯一
  const seen = new Set<string>()
  const search_queries: SearchQuery[] = cleaned.map((row, index) => {
    let id = row.id
    if (!id || seen.has(id)) {
      id = `q_${String(index + 1).padStart(3, '0')}`
      while (seen.has(id)) {
        id = `q_${String(Date.now()).slice(-6)}_${index}`
      }
    }
    seen.add(id)
    return { ...row, id }
  })

  const dimensions =
    input.dimensions ??
    rebuildDimensions(search_queries, existing?.dimensions)

  const expansion: KeywordExpansion = {
    product_id: productId,
    generated_at: new Date().toISOString(),
    dimensions,
    search_queries,
    stats: buildStats(search_queries),
  }

  const filePath = getExpansionPath(productId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(expansion, null, 2)}\n`, 'utf8')

  return {
    ok: true,
    message: `已保存 ${search_queries.length} 条搜索词`,
    expansion,
  }
}
