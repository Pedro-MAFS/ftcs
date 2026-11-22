import { onActivated, onBeforeUnmount, onDeactivated, onMounted, watch, type Ref } from 'vue'

// Track a continuous exposure, including messages that were already read when they entered the view.
export function useVisibleMail(
  root: Ref<HTMLElement | undefined>,
  blocked: () => boolean,
  context: () => string,
  messages: () => unknown,
  submit: (ids: string[]) => Promise<void>,
  report: (e: unknown) => void,
) {
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let observer: IntersectionObserver | undefined
  let resize: ResizeObserver | undefined
  const started = new Map<string, number>()
  const handled = new Set<string>()
  const candidates = new Set<HTMLElement>()
  const observed = new Set<HTMLElement>()
  let generation = 0
  function reset() {
    generation++
    clearTimeout(timer)
    started.clear()
    handled.clear()
  }
  function scan() {
    clearTimeout(timer)
    const el = root.value
    if (!el || !active || blocked() || !document.hasFocus() || document.hidden) {
      reset()
      return
    }
    const bounds = el.getBoundingClientRect()
    const visible = new Set<string>(),
      due: string[] = []
    const now = performance.now()
    let delay = Infinity
    for (const bubble of candidates) {
      const id = bubble.parentElement?.dataset.message
      if (!id || !el.contains(bubble)) continue
      const rect = bubble.getBoundingClientRect()
      const top = Math.max(rect.top, bounds.top, 0),
        bottom = Math.min(rect.bottom, bounds.bottom, innerHeight)
      const left = Math.max(rect.left, bounds.left, 0),
        right = Math.min(rect.right, bounds.right, innerWidth)
      if (!rect.height || bottom - top < Math.min(32, rect.height) - 0.5 || right <= left) continue
      if (!bubble.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))) continue
      visible.add(id)
      if (handled.has(id)) continue
      const since = started.get(id) ?? now
      started.set(id, since)
      if (now - since >= 500) {
        handled.add(id)
        if (bubble.parentElement?.dataset.unread === 'true') due.push(id)
      } else delay = Math.min(delay, 500 - (now - since))
    }
    for (const id of started.keys())
      if (!visible.has(id)) {
        started.delete(id)
        handled.delete(id)
      }
    if (Number.isFinite(delay)) timer = setTimeout(scan, Math.ceil(delay))
    if (due.length) {
      const current = generation
      void submit(due).catch((e) => {
        if (current !== generation) return
        report(e)
        // A later exposure retries. Avoid repeatedly submitting while the error is visible.
      })
    }
  }
  function observe() {
    if (!active || !root.value) return
    const rows = new Set(root.value.querySelectorAll<HTMLElement>('article:not(.out) > .bubble'))
    for (const row of observed)
      if (!rows.has(row)) {
        observer?.unobserve(row)
        resize?.unobserve(row)
        observed.delete(row)
        candidates.delete(row)
      }
    for (const row of rows)
      if (!observed.has(row)) {
        observed.add(row)
        observer?.observe(row)
        resize?.observe(row)
      }
    scan()
  }
  function start() {
    if (active || !root.value) return
    active = true
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const row = entry.target as HTMLElement
          if (entry.isIntersecting && observed.has(row)) candidates.add(row)
          else candidates.delete(row)
        }
        scan()
      },
      { root: root.value },
    )
    resize = new ResizeObserver(scan)
    resize.observe(root.value)
    root.value.addEventListener('scroll', scan)
    window.addEventListener('focus', scan)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', scan)
    observe()
  }
  function stop() {
    active = false
    reset()
    observer?.disconnect()
    resize?.disconnect()
    candidates.clear()
    observed.clear()
    root.value?.removeEventListener('scroll', scan)
    window.removeEventListener('focus', scan)
    window.removeEventListener('blur', reset)
    document.removeEventListener('visibilitychange', scan)
  }
  watch(context, reset, { flush: 'sync' })
  watch([messages, blocked], observe, { flush: 'post' })
  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(stop)
}
