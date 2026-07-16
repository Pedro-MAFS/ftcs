import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { AppStatus } from '../types/app'

const status = ref<AppStatus | null>(null)
const logs = ref<string[]>([])
const error = ref('')
const loading = ref(false)

let timer: ReturnType<typeof setInterval> | undefined
let subscribers = 0

async function refresh(): Promise<void> {
  if (!window.ftcs) {
    error.value = '未检测到 Electron 预加载 API（请在桌面应用中运行）'
    return
  }

  try {
    status.value = await window.ftcs.getAppStatus()
    logs.value = await window.ftcs.getOpenCodeLogs()
    error.value = status.value.opencode?.error ?? status.value.sidecar?.error ?? ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function restartOpenCode(): Promise<void> {
  if (!window.ftcs) return
  loading.value = true
  try {
    status.value = await window.ftcs.restartOpenCode()
    logs.value = await window.ftcs.getOpenCodeLogs()
    error.value = status.value.opencode?.error ?? ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const runtimeState = computed(
  () => status.value?.opencode?.state ?? status.value?.sidecar?.state ?? 'idle',
)

const runtimeHealthy = computed(() => Boolean(status.value?.opencodeHealthy))

const runtimeLabel = computed(() => {
  if (runtimeHealthy.value && runtimeState.value === 'running') return 'OpenCode ready'
  const map: Record<string, string> = {
    idle: 'OpenCode idle',
    starting: 'OpenCode starting',
    running: 'OpenCode running',
    error: 'OpenCode error',
    stopped: 'OpenCode stopped',
  }
  return map[runtimeState.value] ?? 'OpenCode'
})

export function useAppStatus() {
  onMounted(() => {
    subscribers += 1
    void refresh()
    if (!timer) {
      timer = setInterval(() => {
        void refresh()
      }, 3000)
    }
  })

  onUnmounted(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  })

  return {
    status,
    logs,
    error,
    loading,
    runtimeState,
    runtimeHealthy,
    runtimeLabel,
    refresh,
    restartOpenCode,
  }
}
