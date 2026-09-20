import { onMounted, onUnmounted, ref } from 'vue'
import type { ScheduleTriggerPayload } from '../types/electron'
import { useWorkflowExecute } from './useWorkflowExecute'
import { useWorkspace } from './useWorkspace'

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
    } catch (err) {
      await window.ftcs.markWorkflowScheduleRun({
        scheduleId: payload.scheduleId,
        skipped: false,
        ok: false,
      })
      lastMessage.value = err instanceof Error ? err.message : String(err)
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
