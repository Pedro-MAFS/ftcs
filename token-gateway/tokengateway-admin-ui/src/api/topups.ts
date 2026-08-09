import { adminFetch } from './client'
import { fetchLedger, type AdminLedgerListItem, type AdminLedgerListResponse } from './usage'

export type { AdminLedgerListItem, AdminLedgerListResponse }

export interface AdminAdjustmentBody {
  type: 'topup' | 'adjust'
  amount_yuan?: string | number
  amount_li?: number
  operator: string
  note: string
}

export interface AdminAdjustmentResponse {
  user_id: number
  user_code?: string
  tenant_id?: string
  ledger_id: number
  type: string
  amount_li: number
  amount_yuan?: number | string
  balance_before_li: number
  balance_before_yuan?: number | string
  balance_after_li: number
  balance_after_yuan?: number | string
  operator: string
  note: string
  source?: string
  created_at?: string
}

export interface AdminWechatOrderItem {
  id: number
  user_id?: number
  user_code?: string | null
  tenant_id?: string | null
  out_trade_no: string
  status: string
  amount_yuan?: number | string
  wx_transaction_id?: string | null
  ledger_request_id?: string | null
  fail_reason?: string | null
  description?: string | null
  created_at?: string
  paid_at?: string | null
  credited_at?: string | null
  last_notify_trade_state?: string | null
  last_notify_result?: string | null
  last_sync_trade_state?: string | null
  last_sync_result?: string | null
}

export interface AdminWechatOrderListResponse {
  page: number
  size: number
  total: number
  window?: { from?: string; to?: string }
  items: AdminWechatOrderItem[]
}

export function fetchCreditsLedger(opts?: {
  user_id?: number | string
  type?: string
  operator?: string
  from?: string
  to?: string
  page?: number
  size?: number
}) {
  return fetchLedger({
    ...opts,
    type: opts?.type || 'credits',
  })
}

export function fetchWechatOrders(opts?: {
  user_id?: number | string
  status?: string
  out_trade_no?: string
  from?: string
  to?: string
  page?: number
  size?: number
}) {
  const q = new URLSearchParams()
  if (opts?.user_id != null && opts.user_id !== '') q.set('user_id', String(opts.user_id))
  if (opts?.status) q.set('status', opts.status)
  if (opts?.out_trade_no) q.set('out_trade_no', opts.out_trade_no)
  if (opts?.from) q.set('from', opts.from)
  if (opts?.to) q.set('to', opts.to)
  if (opts?.page != null) q.set('page', String(opts.page))
  if (opts?.size != null) q.set('size', String(opts.size))
  const qs = q.toString()
  return adminFetch<AdminWechatOrderListResponse>(
    `/admin/v1/wechat-orders${qs ? `?${qs}` : ''}`,
  )
}

export function postAdjustment(userId: number | string, body: AdminAdjustmentBody) {
  return adminFetch<AdminAdjustmentResponse>(`/admin/v1/users/${userId}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
