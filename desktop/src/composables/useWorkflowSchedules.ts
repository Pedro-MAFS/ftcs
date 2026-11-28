import { ref } from 'vue'
import type { WorkflowSchedule } from '../types/electron'

// 首页和线索库在同一窗口内缓存，共用最近一次从主进程读取的列表。
const schedules = ref<WorkflowSchedule[]>([])
const loading = ref(false)
const listError = ref('')
let request = 0

async function reloadSchedules() {
  const id = ++request
  loading.value = true
  listError.value = ''
  try {
    const result = await window.ftcs?.listWorkflowSchedules?.()
    if (id !== request) return
    if (!result?.ok) throw new Error('无法读取定时任务')
    schedules.value = result.schedules
  } catch (error) {
    if (id === request) listError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (id === request) loading.value = false
  }
}

export function useWorkflowSchedules() {
  return { schedules, loading, listError, reloadSchedules }
}
