import { readonly, ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const toasts = ref<ToastItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let seq = 0

export const TOAST_DEFAULT_MS = 5000
const MAX_VISIBLE = 3

export function showToast(
  message: string,
  options?: { tone?: ToastTone; durationMs?: number },
): void {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return

  const id = ++seq
  const tone = options?.tone ?? 'info'
  const durationMs = options?.durationMs ?? TOAST_DEFAULT_MS

  toasts.value = [...toasts.value, { id, message: text, tone }].slice(-MAX_VISIBLE)

  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => {
      dismissToast(id)
    }, durationMs),
  )
}

export function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  toasts.value = toasts.value.filter((item) => item.id !== id)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    showToast,
    dismissToast,
  }
}
