import { adminFetch } from './client'

export type UserStatus = 'active' | 'disabled'

export interface AdminUserListItem {
  id: number
  tenant_id: string
  user_code: string
  balance_li: number
  balance_yuan: number | string
  status: UserStatus | string
  created_at?: string
  updated_at?: string
}

export interface AdminUserListResponse {
  page: number
  size: number
  total: number
  items: AdminUserListItem[]
}

export interface AdminUserDetail {
  id: number
  tenant_id: string
  user_code: string
  balance_li: number
  balance_yuan: number | string
  status: UserStatus | string
  rpm_limit?: number | null
  tpm_limit?: number | null
  daily_limit_li?: number | null
  created_at?: string
  updated_at?: string
  key_total?: number
  key_active?: number
  key_disabled?: number
}

export interface AdminUserStatusUpdateBody {
  status: UserStatus
  operator: string
  note: string
}

export function fetchUsers(opts?: {
  q?: string
  status?: string
  page?: number
  size?: number
}) {
  const q = new URLSearchParams()
  if (opts?.q) q.set('q', opts.q)
  if (opts?.status) q.set('status', opts.status)
  if (opts?.page != null) q.set('page', String(opts.page))
  if (opts?.size != null) q.set('size', String(opts.size))
  const qs = q.toString()
  return adminFetch<AdminUserListResponse>(`/admin/v1/users${qs ? `?${qs}` : ''}`)
}

export function fetchUser(id: number | string) {
  return adminFetch<AdminUserDetail>(`/admin/v1/users/${id}`)
}

export function updateUserStatus(id: number | string, body: AdminUserStatusUpdateBody) {
  return adminFetch<AdminUserDetail>(`/admin/v1/users/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
