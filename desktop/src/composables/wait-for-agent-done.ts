import type { AgentEventPayload } from '../types/electron'

export function waitForAgentDone(
  productId: string,
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
      if (payload.type !== 'done') return
      if (payload.productId !== productId) return
      cleanup()
      resolve({ ok: payload.ok, message: payload.message })
    }

    unsubscribe = window.ftcs.onAgentEvent(listener)

    if (options?.timeoutMs != null && options.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('等待 Agent 完成超时'))
      }, options.timeoutMs)
    }
  })
}
