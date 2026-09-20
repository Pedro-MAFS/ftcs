export type WorkflowScheduleRecurrence = 'daily' | 'weekly'

export type WorkflowSchedule = {
  id: string
  productId: string
  planId: string
  enabled: boolean
  recurrence: WorkflowScheduleRecurrence
  /** 0=周日 … 6=周六；weekly 必填 */
  weekday?: number | null
  /** 本地时刻 HH:mm */
  timeLocal: string
  lastRunAt?: string | null
  createdAt: string
  updatedAt: string
}

export type WorkflowScheduleSaveInput = {
  id?: string
  productId: string
  planId: string
  enabled?: boolean
  recurrence: WorkflowScheduleRecurrence
  weekday?: number | null
  timeLocal: string
}

export const WORKFLOW_SCHEDULE_MAX = 5

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTimeLocal(value: string): boolean {
  return TIME_RE.test(value.trim())
}

export function normalizeWeekday(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 6) return null
  return n
}

/** 给定「现在」，计算该任务最近一次应跑的本地时刻（含当前这一分钟） */
export function computeLastDueAt(
  schedule: Pick<WorkflowSchedule, 'enabled' | 'recurrence' | 'weekday' | 'timeLocal'>,
  now: Date = new Date(),
): Date | null {
  if (!schedule.enabled) return null
  if (!isValidTimeLocal(schedule.timeLocal)) return null

  const [hh, mm] = schedule.timeLocal.split(':').map((x) => Number(x))
  const candidate = new Date(now)
  candidate.setSeconds(0, 0)
  candidate.setHours(hh, mm, 0, 0)

  if (schedule.recurrence === 'daily') {
    if (candidate.getTime() <= now.getTime()) return candidate
    candidate.setDate(candidate.getDate() - 1)
    return candidate
  }

  const weekday = normalizeWeekday(schedule.weekday)
  if (weekday === null) return null

  // 回退最多 7 天找到匹配 weekday 且 ≤ now 的 due
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now)
    d.setSeconds(0, 0)
    d.setHours(hh, mm, 0, 0)
    d.setDate(d.getDate() - i)
    if (d.getDay() !== weekday) continue
    if (d.getTime() <= now.getTime()) return d
  }
  return null
}

export function isDueNow(
  schedule: WorkflowSchedule,
  now: Date = new Date(),
  graceMs = 60_000,
): boolean {
  const due = computeLastDueAt(schedule, now)
  if (!due) return false
  const elapsed = now.getTime() - due.getTime()
  if (elapsed < 0 || elapsed >= graceMs) return false
  if (schedule.lastRunAt) {
    const last = Date.parse(schedule.lastRunAt)
    if (Number.isFinite(last) && last >= due.getTime()) return false
  }
  return true
}

/** 启动补跑：上一应跑时刻晚于 lastRunAt，且距今 ≤ 24h，且已过 due 超过 1 分钟 */
export function needsCatchUp(
  schedule: WorkflowSchedule,
  now: Date = new Date(),
  maxAgeMs = 24 * 60 * 60 * 1000,
): boolean {
  const due = computeLastDueAt(schedule, now)
  if (!due) return false
  const age = now.getTime() - due.getTime()
  if (age < 60_000 || age > maxAgeMs) return false
  if (schedule.lastRunAt) {
    const last = Date.parse(schedule.lastRunAt)
    if (Number.isFinite(last) && last >= due.getTime()) return false
  }
  return true
}

export function slotKey(scheduleId: string, due: Date): string {
  const y = due.getFullYear()
  const m = String(due.getMonth() + 1).padStart(2, '0')
  const d = String(due.getDate()).padStart(2, '0')
  const hh = String(due.getHours()).padStart(2, '0')
  const mm = String(due.getMinutes()).padStart(2, '0')
  return `${scheduleId}|${y}-${m}-${d}|${hh}:${mm}`
}
