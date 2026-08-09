import { adminFetch } from './client'

export interface AdminTimeWindow {
  from: string
  to: string
}

export interface AdminRequestListItem {
  request_id: string
  created_at?: string
  user_id?: number
  user_code?: string | null
  tenant_id?: string | null
  key_name?: string
  model?: string
  status?: string
  billing_status?: string
  prompt_tokens?: number | null
  completion_tokens?: number | null
  revenue_li?: number | null
  revenue_yuan?: number | string | null
  cogs_li?: number | null
  cogs_yuan?: number | string | null
  margin_li?: number | null
  margin_yuan?: number | string | null
  latency_ms?: number | null
  error_summary?: string | null
}

export interface AdminRequestListResponse {
  page: number
  size: number
  total: number
  window?: AdminTimeWindow
  items: AdminRequestListItem[]
}

export interface AdminRequestDetail extends AdminRequestListItem {
  key_id?: number
  cached_tokens?: number | null
  uncached_tokens?: number | null
  upstream_status?: number | null
  settle_owner?: string | null
  settle_claimed_at?: string | null
  ledger_charge?: {
    id: number
    amount_li: number
    amount_yuan?: number | string
    balance_after_li?: number
    created_at?: string
  } | null
}

export interface AdminLedgerListItem {
  id: number
  user_id?: number
  user_code?: string | null
  tenant_id?: string | null
  type: string
  amount_li: number
  amount_yuan?: number | string
  balance_after_li?: number
  balance_after_yuan?: number | string
  request_id?: string | null
  note?: string | null
  operator?: string | null
  /** wechat | manual；charge 通常为空 */
  source?: string | null
  created_at?: string
}

export interface AdminLedgerListResponse {
  page: number
  size: number
  total: number
  window?: AdminTimeWindow
  items: AdminLedgerListItem[]
}

export function fetchRequests(opts?: {
  user_id?: number | string
  q?: string
  model?: string
  billing_status?: string
  key_name?: string
  status?: string
  from?: string
  to?: string
  page?: number
  size?: number
}) {
  const q = new URLSearchParams()
  if (opts?.user_id != null && opts.user_id !== '') q.set('user_id', String(opts.user_id))
  if (opts?.q) q.set('q', opts.q)
  if (opts?.model) q.set('model', opts.model)
  if (opts?.billing_status) q.set('billing_status', opts.billing_status)
  if (opts?.key_name) q.set('key_name', opts.key_name)
  if (opts?.status) q.set('status', opts.status)
  if (opts?.from) q.set('from', opts.from)
  if (opts?.to) q.set('to', opts.to)
  if (opts?.page != null) q.set('page', String(opts.page))
  if (opts?.size != null) q.set('size', String(opts.size))
  const qs = q.toString()
  return adminFetch<AdminRequestListResponse>(`/admin/v1/requests${qs ? `?${qs}` : ''}`)
}

export function fetchRequest(requestId: string) {
  return adminFetch<AdminRequestDetail>(`/admin/v1/requests/${encodeURIComponent(requestId)}`)
}

export function fetchLedger(opts?: {
  user_id?: number | string
  type?: string
  request_id?: string
  operator?: string
  from?: string
  to?: string
  page?: number
  size?: number
}) {
  const q = new URLSearchParams()
  if (opts?.user_id != null && opts.user_id !== '') q.set('user_id', String(opts.user_id))
  if (opts?.type) q.set('type', opts.type)
  if (opts?.request_id) q.set('request_id', opts.request_id)
  if (opts?.operator) q.set('operator', opts.operator)
  if (opts?.from) q.set('from', opts.from)
  if (opts?.to) q.set('to', opts.to)
  if (opts?.page != null) q.set('page', String(opts.page))
  if (opts?.size != null) q.set('size', String(opts.size))
  const qs = q.toString()
  return adminFetch<AdminLedgerListResponse>(`/admin/v1/ledger${qs ? `?${qs}` : ''}`)
}
