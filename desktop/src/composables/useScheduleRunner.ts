import { onMounted, onUnmounted, ref } from 'vue'
import type { ScheduleTriggerPayload } from '../types/electron'
import { useWorkflowExecute } from './useWorkflowExecute'
import { useWorkspace } from './useWorkspace'
import { showToast } from './useToast'

/** 主进程定时触发 → 切产品 → executePlan */
export function useScheduleRunner(): {
  lastMessage: ReturnType<typeof ref<string>>
} {
  const lastMessage = ref('')
  const { activeProductId, loadActiveProfile, refreshPipelineArtifacts, generating, agentStatus } =
    useWorkspace()
  const { executePlan, running } = useWorkflowExecute({
    onMessage: (msg) => {
      lastMessage.value = msg
    },
  })

  let unsubscribe: (() => void) | undefined
  let chain: Promise<void> = Promise.resolve()

  function reportFailure(message: string): void {
    lastMessage.value = message
    showToast(message, { tone: 'error', durationMs: 10000 })
  }

  async function handleTrigger(payload: ScheduleTriggerPayload): Promise<void> {
    if (!window.ftcs?.markWorkflowScheduleRun) return

    if (running.value || generating.value || agentStatus.value === 'running') {
      await window.ftcs.markWorkflowScheduleRun({
        scheduleId: payload.scheduleId,
        skipped: true,
      })
      lastMessage.value = '定时任务已跳过：有任务进行中'
      return
    }

    try {
      if (!window.ftcs.getProfile) throw new Error('无法检查定时任务绑定的产品')
      const profile = await window.ftcs.getProfile(payload.productId)
      if (!profile || profile.status === 'deleted' || profile.status === 'archived') {
        reportFailure(`定时任务未执行：绑定的产品（${payload.productId}）已删除或不存在，请编辑或删除该定时任务。`)
        await window.ftcs.markWorkflowScheduleRun({
          scheduleId: payload.scheduleId,
          skipped: false,
          ok: false,
        })
        return
      }

      activeProductId.value = payload.productId
      await loadActiveProfile()
      await refreshPipelineArtifacts()

      if (activeProductId.value !== payload.productId) {
        await window.ftcs.markWorkflowScheduleRun({
          scheduleId: payload.scheduleId,
          skipped: true,
        })
        lastMessage.value = '定时任务已跳过：无法切换到指定产品'
        return
      }

      const result = await executePlan(payload.planId)
      await window.ftcs.markWorkflowScheduleRun({
        scheduleId: payload.scheduleId,
        skipped: false,
        ok: result.ok,
      })
      lastMessage.value = result.message
      if (!result.ok) reportFailure(`定时任务未完成：${result.message}`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      reportFailure(`定时任务未完成：${detail}`)
      await window.ftcs.markWorkflowScheduleRun({
        scheduleId: payload.scheduleId,
        skipped: false,
        ok: false,
      })
    }
  }

  onMounted(() => {
    unsubscribe = window.ftcs?.onScheduleTrigger?.((payload) => {
      chain = chain.then(() => handleTrigger(payload)).catch(() => undefined)
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return { lastMessage }
}
