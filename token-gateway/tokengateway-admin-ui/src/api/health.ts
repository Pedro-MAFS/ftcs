import { adminFetch } from './client'

export interface AdminHealth {
  status: string
  service?: string
}

export function fetchAdminHealth() {
  return adminFetch<AdminHealth>('/admin/v1/health')
}
