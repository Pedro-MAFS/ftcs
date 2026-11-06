import type { AgentEventPayload } from '../types/electron'

export function waitForAgentDone(
  taskId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve, reject) => {
    if (!window.ftcs?.onAgentEvent) {
      reject(new Error('Agent 事件不可用'))
      return
    }

    const signal = options?.signal
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => void) | undefined

    const cleanup = (): void => {
      unsubscribe?.()
      unsubscribe = undefined
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = (): void => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort)

    const listener = (payload: AgentEventPayload): void => {
      if (payload.type !== 'task.changed' || payload.task.task_id !== taskId || !payload.task.finished_at) return
      cleanup()
      resolve({ ok: payload.task.state === 'succeeded', message: payload.task.message })
    }

    unsubscribe = window.ftcs.onAgentEvent(listener)

    void window.ftcs.taskSnapshot?.().then(records => {
      const task = records.find(record => record.task_id === taskId)
      if (task) listener({ type: 'task.changed', task })
    }).catch(error => { cleanup(); reject(error) })

    if (options?.timeoutMs != null && options.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('等待 Agent 完成超时'))
      }, options.timeoutMs)
    }
  })
}
