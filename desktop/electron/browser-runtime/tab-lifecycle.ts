export const BUILTIN_TAB_CAP = 10
export const BUILTIN_TAB_RECLAIM_AT = 5
export const BUILTIN_TAB_CAP_MESSAGE = '内置浏览器标签已达上限，这一页没有打开。'

export type TabOrigin = 'seed' | 'task' | 'user'

export interface LifecycleTab {
  id: string
  origin: TabOrigin
  taskId: string | null
}

export interface ReclaimPlan {
  tabs: LifecycleTab[]
  droppedIds: string[]
  reject: boolean
}

type CloseResult = { closed: number; remaining: number }
type CloseHost = (taskId: string) => Promise<CloseResult>

let currentTaskId: string | null = null
let taskSerial = 0
let closeHost: CloseHost | null = null

export function setTabCloseHost(host: CloseHost | null): void {
  closeHost = host
}

export function getCurrentBrowserTaskId(): string | null {
  return currentTaskId
}

export function nextBrowserTaskId(skill: string): string {
  taskSerial += 1
  return `browser-${skill}-${taskSerial}`
}

/**
 * 登记当前任务。若上一个 id 还没结束，先按那个 id 收页，再把当前 id 换成新的。
 * 新 id 在等待上一次收页之前就写上，避免等待期间新开的页被算进旧任务。
 */
export function beginBrowserTask(taskId: string): void {
  const previous = currentTaskId
  currentTaskId = taskId
  if (previous && previous !== taskId) {
    void endBrowserTask(previous)
  }
}

export async function endBrowserTask(taskId: string): Promise<CloseResult> {
  const result = closeHost ? await closeHost(taskId) : { closed: 0, remaining: 0 }
  if (currentTaskId === taskId) currentTaskId = null
  console.info(
    `browser-tabs end task=${taskId} closed=${result.closed} remaining=${result.remaining}`,
  )
  return result
}

/** 开页前：达到回收线先关当前任务最旧的任务页；回收后仍达到上限则拒绝。 */
export function reclaimBeforeOpen(
  tabs: LifecycleTab[],
  currentTaskIdForOpen: string | null,
): ReclaimPlan {
  const droppedIds: string[] = []
  let next = tabs.slice()
  if (next.length >= BUILTIN_TAB_RECLAIM_AT && currentTaskIdForOpen) {
    const drop = new Set<string>()
    let length = next.length
    for (const tab of next) {
      if (length < BUILTIN_TAB_RECLAIM_AT) break
      if (tab.origin === 'task' && tab.taskId === currentTaskIdForOpen) {
        drop.add(tab.id)
        droppedIds.push(tab.id)
        length -= 1
      }
    }
    if (drop.size > 0) next = next.filter((tab) => !drop.has(tab.id))
  }
  return {
    tabs: next,
    droppedIds,
    reject: next.length >= BUILTIN_TAB_CAP,
  }
}

export function openTabWithGuard(
  tabs: LifecycleTab[],
  newId: string,
  taskId: string | null,
): { tabs: LifecycleTab[]; opened: boolean; error: string | null } {
  const plan = reclaimBeforeOpen(tabs, taskId)
  if (plan.reject) {
    return { tabs: plan.tabs, opened: false, error: BUILTIN_TAB_CAP_MESSAGE }
  }
  const origin: TabOrigin = taskId ? 'task' : 'user'
  return {
    tabs: [...plan.tabs, { id: newId, origin, taskId }],
    opened: true,
    error: null,
  }
}

/** 只关本次任务页。最后一枚不能关掉时改回种子页。 */
export function closeTaskTabs(
  tabs: LifecycleTab[],
  taskId: string,
): { tabs: LifecycleTab[]; closed: number; remaining: number } {
  if (tabs.length === 0) return { tabs: [], closed: 0, remaining: 0 }
  const drop = new Set<string>()
  let remaining = tabs.length
  let reseedId: string | null = null
  for (const tab of tabs) {
    if (tab.origin !== 'task' || tab.taskId !== taskId) continue
    if (remaining <= 1) {
      reseedId = tab.id
      break
    }
    drop.add(tab.id)
    remaining -= 1
  }
  const next = tabs
    .filter((tab) => !drop.has(tab.id))
    .map((tab) =>
      tab.id === reseedId ? { ...tab, origin: 'seed' as const, taskId: null } : tab,
    )
  return { tabs: next, closed: drop.size, remaining: next.length }
}

export function resetTabLifecycleForTests(): void {
  currentTaskId = null
  taskSerial = 0
  closeHost = null
}
