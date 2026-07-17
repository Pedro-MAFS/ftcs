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
