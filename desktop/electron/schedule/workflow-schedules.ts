import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import {
  WORKFLOW_SCHEDULE_MAX,
  isValidTimeLocal,
  normalizeWeekday,
  type WorkflowSchedule,
  type WorkflowScheduleRecurrence,
  type WorkflowScheduleSaveInput,
} from './workflow-schedule-types'

const FILE_REL = path.join('data', 'prefs', 'workflow-schedules.json')

type Envelope = {
  version?: unknown
  schedules?: unknown
}

function filePath(workspaceRoot = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, FILE_REL)
}

function parseSchedule(raw: unknown): WorkflowSchedule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = String(r.id || '').trim()
  const productId = String(r.productId || '').trim()
  const planId = String(r.planId || '').trim()
  const recurrence = r.recurrence === 'weekly' ? 'weekly' : r.recurrence === 'daily' ? 'daily' : null
  const timeLocal = String(r.timeLocal || '').trim()
  if (!id || !productId || !planId || !recurrence || !isValidTimeLocal(timeLocal)) return null

  const weekday = normalizeWeekday(r.weekday)
  if (recurrence === 'weekly' && weekday === null) return null

  const createdAt =
    typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : new Date().toISOString()
  const updatedAt =
    typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : createdAt

  return {
    id,
    productId,
    planId,
    enabled: r.enabled !== false,
    recurrence,
    weekday: recurrence === 'weekly' ? weekday : null,
    timeLocal,
    lastRunAt: typeof r.lastRunAt === 'string' ? r.lastRunAt : null,
    createdAt,
    updatedAt,
  }
}

function writeAll(workspaceRoot: string, schedules: WorkflowSchedule[]): void {
  const file = filePath(workspaceRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ version: 1, schedules }, null, 2)}\n`,
    'utf8',
  )
}

export function listWorkflowSchedules(workspaceRoot = getWorkspaceRoot()): WorkflowSchedule[] {
  const file = filePath(workspaceRoot)
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Envelope
    if (!Array.isArray(raw.schedules)) return []
    return raw.schedules.map(parseSchedule).filter((x): x is WorkflowSchedule => Boolean(x))
  } catch {
    return []
  }
}

export function saveWorkflowSchedule(
  input: WorkflowScheduleSaveInput,
  workspaceRoot = getWorkspaceRoot(),
): { ok: true; schedule: WorkflowSchedule } | { ok: false; message: string } {
  const productId = String(input.productId || '').trim()
  const planId = String(input.planId || '').trim()
  const recurrence: WorkflowScheduleRecurrence =
    input.recurrence === 'weekly' ? 'weekly' : 'daily'
  const timeLocal = String(input.timeLocal || '').trim()
  if (!productId) return { ok: false, message: '请选择产品' }
  if (!planId) return { ok: false, message: '请选择方案' }
  if (!isValidTimeLocal(timeLocal)) return { ok: false, message: '时刻格式须为 HH:mm' }

  const weekday = normalizeWeekday(input.weekday)
  if (recurrence === 'weekly' && weekday === null) {
    return { ok: false, message: '每周任务须选择星期' }
  }

  const all = listWorkflowSchedules(workspaceRoot)
  const now = new Date().toISOString()
  const existingId = input.id?.trim()
  const existing = existingId ? all.find((s) => s.id === existingId) : undefined

  if (!existing && all.length >= WORKFLOW_SCHEDULE_MAX) {
    return { ok: false, message: `最多 ${WORKFLOW_SCHEDULE_MAX} 条定时任务` }
  }

  const schedule: WorkflowSchedule = {
    id: existing?.id ?? `sch_${crypto.randomBytes(6).toString('hex')}`,
    productId,
    planId,
    enabled: input.enabled !== false,
    recurrence,
    weekday: recurrence === 'weekly' ? weekday : null,
    timeLocal,
    lastRunAt: existing?.lastRunAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const next = existing
    ? all.map((s) => (s.id === schedule.id ? schedule : s))
    : [...all, schedule]
  writeAll(workspaceRoot, next)
  return { ok: true, schedule }
}

export function deleteWorkflowSchedule(
  id: string,
  workspaceRoot = getWorkspaceRoot(),
): { ok: true } | { ok: false; message: string } {
  const scheduleId = String(id || '').trim()
  if (!scheduleId) return { ok: false, message: '缺少任务 id' }
  const all = listWorkflowSchedules(workspaceRoot)
  if (!all.some((s) => s.id === scheduleId)) {
    return { ok: false, message: `定时任务不存在：${scheduleId}` }
  }
  writeAll(
    workspaceRoot,
    all.filter((s) => s.id !== scheduleId),
  )
  return { ok: true }
}

export function markWorkflowScheduleRun(
  id: string,
  atIso = new Date().toISOString(),
  workspaceRoot = getWorkspaceRoot(),
): { ok: true; schedule: WorkflowSchedule } | { ok: false; message: string } {
  const all = listWorkflowSchedules(workspaceRoot)
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) return { ok: false, message: `定时任务不存在：${id}` }
  const updated: WorkflowSchedule = {
    ...all[idx]!,
    lastRunAt: atIso,
    updatedAt: atIso,
  }
  const next = [...all]
  next[idx] = updated
  writeAll(workspaceRoot, next)
  return { ok: true, schedule: updated }
}
