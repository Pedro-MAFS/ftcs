import { adminFetch } from './client'

export interface AdminTimeWindow {
  from: string
  to: string
}

export interface AdminDashboardSummary {
  timezone: string
  as_of?: string
  windows?: {
    today?: AdminTimeWindow
    d7?: AdminTimeWindow
    d30?: AdminTimeWindow
  }
  users: {
    total: number
    today_new: number
    yesterday_new?: number
    d7_new?: number
    d30_new?: number
  }
  topup: {
    today_amount_li: number
    today_amount_yuan: number | string
    today_count: number
    d7_amount_yuan?: number | string
    d7_count?: number
    d30_amount_yuan?: number | string
    d30_count?: number
    adjust_today_amount_yuan?: number | string | null
  }
  charge: {
    today_amount_li: number
    today_amount_yuan: number | string
    today_count: number
    d7_amount_yuan?: number | string
    d7_count?: number
    d30_amount_yuan?: number | string
    d30_count?: number
    today_cogs_yuan?: number | string | null
    today_margin_yuan?: number | string | null
  }
  active: {
    dau: number
    wau: number
    wau_ratio?: number | string | null
  }
}

export interface AdminDashboardSeriesPoint {
  day: string
  value_li?: number | null
  value_yuan?: number | string | null
  count?: number | null
  users?: number | null
}

export interface AdminDashboardSeries {
  timezone: string
  metric: string
  days: number
  from?: string
  to?: string
  points: AdminDashboardSeriesPoint[]
}

export type DashboardMetric = 'user_growth' | 'topup' | 'charge' | 'dau'

export function fetchDashboardSummary() {
  return adminFetch<AdminDashboardSummary>('/admin/v1/dashboard/summary')
}

export function fetchDashboardSeries(metric: DashboardMetric, days: 7 | 30 = 30) {
  const q = new URLSearchParams({ metric, days: String(days) })
  return adminFetch<AdminDashboardSeries>(`/admin/v1/dashboard/series?${q}`)
}
