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

async function startOpenCode(): Promise<void> {
  if (!window.ftcs?.startOpenCode) return
  loading.value = true
  try {
    const res = await window.ftcs.startOpenCode()
    status.value = res.status
    error.value = res.ok ? '' : res.message
    logs.value = await window.ftcs.getOpenCodeLogs()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function stopOpenCode(): Promise<void> {
  if (!window.ftcs?.stopOpenCode) return
  loading.value = true
  try {
    const res = await window.ftcs.stopOpenCode()
    status.value = res.status
    error.value = res.ok ? '' : res.message
    logs.value = await window.ftcs.getOpenCodeLogs()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
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

async function reconnectMcp(name: string): Promise<string | null> {
  if (!window.ftcs?.reconnectMcp) return '暂不支持重新连接，请重启应用'
  loading.value = true
  try {
    const res = await window.ftcs.reconnectMcp(name)
    status.value = res.status
    if (!res.ok) {
      error.value = '暂不支持重新连接，请重启应用'
      return '暂不支持重新连接，请重启应用'
    }
    error.value = ''
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message
    return message
  } finally {
    loading.value = false
  }
}

const runtimeState = computed(
  () => status.value?.opencode?.state ?? status.value?.sidecar?.state ?? 'idle',
)

const runtimeHealthy = computed(() => Boolean(status.value?.opencodeHealthy))

const runtimeLabel = computed(() => {
  if (runtimeHealthy.value && runtimeState.value === 'running') return '服务已就绪'
  const map: Record<string, string> = {
    idle: '服务空闲',
    starting: '服务启动中',
    running: '服务运行中',
    error: '服务异常',
    stopped: '服务已停止',
  }
  return map[runtimeState.value] ?? '服务未就绪'
})

const mcpServers = computed(() => status.value?.mcpServers ?? [])

const mcpConnectedCount = computed(
  () => mcpServers.value.filter((s) => (s.status || '').toLowerCase() === 'connected').length,
)

const mcpTotalCount = computed(() => mcpServers.value.length)

const agentRunning = computed(() => Boolean(status.value?.agentRunning))

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
    mcpServers,
    mcpConnectedCount,
    mcpTotalCount,
    agentRunning,
    refresh,
    startOpenCode,
    stopOpenCode,
    restartOpenCode,
    reconnectMcp,
  }
}
