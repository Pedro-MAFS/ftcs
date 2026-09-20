import type { BrowserWindow } from 'electron'
import { IPC } from '../ipc/types'
import { showTaskDoneNotification } from '../notify/task-done-notify'
import {
  computeLastDueAt,
  isDueNow,
  needsCatchUp,
  slotKey,
  type WorkflowSchedule,
} from './workflow-schedule-types'
import { listWorkflowSchedules, markWorkflowScheduleRun } from './workflow-schedules'

export type ScheduleTriggerPayload = {
  scheduleId: string
  productId: string
  planId: string
  reason: 'due' | 'catch-up'
}

type SchedulerDeps = {
  getMainWindow: () => BrowserWindow | null
}

let timer: ReturnType<typeof setInterval> | null = null
let deps: SchedulerDeps | null = null
/** 本进程内已触发过的 due 槽，避免每分钟重复派发 */
const firedSlots = new Set<string>()
const skipNotifiedSlots = new Set<string>()

export function startWorkflowScheduler(nextDeps: SchedulerDeps): void {
  deps = nextDeps
  stopWorkflowScheduler()
  // 启动后稍等渲染就绪，再做漏跑补偿
  setTimeout(() => {
    tickWorkflowScheduler({ includeCatchUp: true })
  }, 8_000)
  timer = setInterval(() => {
    tickWorkflowScheduler({ includeCatchUp: false })
  }, 30_000)
}

export function stopWorkflowScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function resetWorkflowSchedulerStateForTests(): void {
  firedSlots.clear()
  skipNotifiedSlots.clear()
}

function pickCandidates(now: Date, includeCatchUp: boolean): Array<{
  schedule: WorkflowSchedule
  reason: 'due' | 'catch-up'
  due: Date
}> {
  const out: Array<{ schedule: WorkflowSchedule; reason: 'due' | 'catch-up'; due: Date }> = []
  for (const schedule of listWorkflowSchedules()) {
    if (!schedule.enabled) continue
    const due = computeLastDueAt(schedule, now)
    if (!due) continue
    const key = slotKey(schedule.id, due)
    if (firedSlots.has(key)) continue

    if (isDueNow(schedule, now)) {
      out.push({ schedule, reason: 'due', due })
      continue
    }
    if (includeCatchUp && needsCatchUp(schedule, now)) {
      out.push({ schedule, reason: 'catch-up', due })
    }
  }
  return out
}

export function tickWorkflowScheduler(opts?: { includeCatchUp?: boolean; now?: Date }): void {
  if (!deps) return
  const now = opts?.now ?? new Date()
  const candidates = pickCandidates(now, Boolean(opts?.includeCatchUp))
  if (!candidates.length) return

  const win = deps.getMainWindow()
  if (!win || win.isDestroyed()) return

  for (const item of candidates) {
    const key = slotKey(item.schedule.id, item.due)
    firedSlots.add(key)
    const payload: ScheduleTriggerPayload = {
      scheduleId: item.schedule.id,
      productId: item.schedule.productId,
      planId: item.schedule.planId,
      reason: item.reason,
    }
    try {
      win.webContents.send(IPC.SCHEDULE_TRIGGER, payload)
    } catch (err) {
      console.warn('[ftcs:schedule] send trigger failed', err)
      firedSlots.delete(key)
    }
  }
}

/** 渲染进程回报：已执行或跳过 */
export function handleScheduleRunResult(input: {
  scheduleId: string
  skipped?: boolean
  ok?: boolean
}): void {
  const scheduleId = String(input.scheduleId || '').trim()
  if (!scheduleId) return

  if (input.skipped) {
    const schedules = listWorkflowSchedules()
    const schedule = schedules.find((s) => s.id === scheduleId)
    if (schedule) {
      const due = computeLastDueAt(schedule)
      const key = due ? slotKey(scheduleId, due) : scheduleId
      if (!skipNotifiedSlots.has(key)) {
        skipNotifiedSlots.add(key)
        showTaskDoneNotification({
          ok: false,
          body: '定时任务已跳过：有任务进行中',
        })
      }
      // 忙碌跳过：允许同槽稍后重试
      firedSlots.delete(key)
    }
    return
  }

  markWorkflowScheduleRun(scheduleId)
}
