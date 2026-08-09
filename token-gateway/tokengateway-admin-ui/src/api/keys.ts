import { adminFetch } from './client'

export type KeyStatus = 'active' | 'disabled'

export interface AdminUserKeyItem {
  id: number
  name: string
  prefix: string
  status: KeyStatus | string
  created_at?: string
  updated_at?: string
  last_used_at?: string | null
}

export interface AdminUserKeyListResponse {
  user_id: number
  items: AdminUserKeyItem[]
}

export interface AdminUserKeyStatusUpdateBody {
  status: KeyStatus
  operator: string
  note: string
}

export interface AdminUserKeyRotateBody {
  operator: string
  note: string
}

export interface AdminUserKeyRotateResponse {
  action: 'created' | 'rotated' | string
  user_id: number
  name: string
  prefix: string
  status: KeyStatus | string
  api_key: string
}

export function fetchUserKeys(userId: number | string) {
  return adminFetch<AdminUserKeyListResponse>(`/admin/v1/users/${userId}/keys`)
}

export function updateUserKeyStatus(
  userId: number | string,
  name: string,
  body: AdminUserKeyStatusUpdateBody,
) {
  return adminFetch<AdminUserKeyItem>(
    `/admin/v1/users/${userId}/keys/${encodeURIComponent(name)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export function rotateUserKey(
  userId: number | string,
  name: string,
  body: AdminUserKeyRotateBody,
) {
  return adminFetch<AdminUserKeyRotateResponse>(
    `/admin/v1/users/${userId}/keys/${encodeURIComponent(name)}/rotate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}
