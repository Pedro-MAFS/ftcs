import { adminFetch } from './client'

export type PriceBillingUnit = 'per_mtok' | 'per_call'
export type PriceStatus = 'current' | 'history' | 'scheduled'

export interface AdminPriceItem {
  id: number
  model: string
  billing_unit: PriceBillingUnit
  status: PriceStatus
  effective_from: string
  created_at?: string
  input_price_li_per_mtok?: number
  output_price_li_per_mtok?: number
  upstream_input_cost_li_per_mtok?: number
  upstream_cache_cost_li_per_mtok?: number
  upstream_output_cost_li_per_mtok?: number
  input_price_yuan_per_mtok?: number | string
  output_price_yuan_per_mtok?: number | string
  upstream_input_cost_yuan_per_mtok?: number | string
  upstream_cache_cost_yuan_per_mtok?: number | string
  upstream_output_cost_yuan_per_mtok?: number | string
  price_li_per_call?: number
  cogs_li_per_call?: number
  price_yuan_per_call?: number | string
  cogs_yuan_per_call?: number | string
}

export interface AdminPriceListResponse {
  as_of: string
  items: AdminPriceItem[]
}

/** 与后端默认白名单对齐；扩容改 admin 配置后此处可再同步。 */
export const DEFAULT_ALLOWED_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'tavily.search',
] as const

export const TAVILY_SEARCH = 'tavily.search'

export interface AdminPriceCreateBody {
  model: string
  billing_unit: PriceBillingUnit
  effective_from: string
  operator: string
  note: string
  input_price_li_per_mtok?: number
  output_price_li_per_mtok?: number
  upstream_input_cost_li_per_mtok?: number
  upstream_cache_cost_li_per_mtok?: number
  upstream_output_cost_li_per_mtok?: number
  price_li_per_call?: number
  cogs_li_per_call?: number
}

export function fetchPrices(opts?: {
  model?: string
  includeHistory?: boolean
  includeScheduled?: boolean
}) {
  const q = new URLSearchParams()
  if (opts?.model) q.set('model', opts.model)
  if (opts?.includeHistory) q.set('include_history', 'true')
  if (opts?.includeScheduled === false) q.set('include_scheduled', 'false')
  const qs = q.toString()
  return adminFetch<AdminPriceListResponse>(`/admin/v1/prices${qs ? `?${qs}` : ''}`)
}

export function createPrice(body: AdminPriceCreateBody) {
  return adminFetch<AdminPriceItem>('/admin/v1/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function isPerCallModel(model: string): boolean {
  return model === TAVILY_SEARCH
}
