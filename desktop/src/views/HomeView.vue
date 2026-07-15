<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { AppStatus } from '../types/app'

const status = ref<AppStatus | null>(null)
const logs = ref<string[]>([])
const loading = ref(false)
const error = ref('')

const runtimeStateLabel = computed(() => {
  const state = status.value?.opencode?.state ?? status.value?.sidecar?.state
  const map: Record<string, string> = {
    idle: '空闲',
    starting: '启动中',
    running: '运行中',
    error: '错误',
    stopped: '已停止',
  }
  return state ? (map[state] ?? state) : '-'
})

const runtimeBadgeClass = computed(() => {
  const state = status.value?.opencode?.state ?? status.value?.sidecar?.state ?? 'idle'
  return `status-badge status-${state}`
})

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

let timer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await refresh()
  timer = setInterval(refresh, 3000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="card">
    <h2>系统状态（Phase 2.0 · SDK Server+Client）</h2>
    <div class="grid">
      <div class="metric">
        <div class="metric-label">OpenCode Runtime</div>
        <div class="metric-value">
          <span :class="runtimeBadgeClass">{{ runtimeStateLabel }}</span>
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">健康检查</div>
        <div class="metric-value">{{ status?.opencodeHealthy ? '正常' : '未就绪' }}</div>
      </div>
      <div class="metric">
        <div class="metric-label">服务地址</div>
        <div class="metric-value">{{ status?.opencode?.baseUrl ?? '-' }}</div>
      </div>
      <div class="metric">
        <div class="metric-label">版本</div>
        <div class="metric-value">{{ status?.opencode?.version ?? '-' }}</div>
      </div>
    </div>

    <div v-if="error" class="error-text">{{ error }}</div>

    <div class="actions">
      <button :disabled="loading" @click="restartOpenCode">
        {{ loading ? '重启中…' : '重启 OpenCode' }}
      </button>
      <button class="secondary" @click="refresh">刷新</button>
    </div>

    <p class="hint">
      工作区：<code>{{ status?.workspaceRoot ?? '-' }}</code><br />
      模式：<code>{{ status?.opencode?.mode ?? 'sdk-server-client' }}</code>
      · 需本机安装 OpenCode（暂未内嵌二进制）
    </p>
    <p v-if="status?.opencode?.binaryPath || status?.opencode?.pid" class="hint">
      <template v-if="status?.opencode?.binaryPath">
        CLI：<code>{{ status.opencode.binaryPath }}</code>
      </template>
      <template v-if="status?.opencode?.pid">
        · PID：<code>{{ status.opencode.pid }}</code>
      </template>
    </p>
  </section>

  <section class="card">
    <h2>MCP 服务</h2>
    <ul v-if="status?.mcpServers?.length" class="mcp-list">
      <li v-for="item in status.mcpServers" :key="item.name">
        <span>{{ item.name }}</span>
        <span>{{ item.status }}</span>
      </li>
    </ul>
    <p v-else class="hint">OpenCode 未就绪或 MCP 尚未连接。</p>
  </section>

  <section class="card">
    <h2>运行日志</h2>
    <div class="log-box">{{ logs.join('\n') || '暂无日志' }}</div>
  </section>
</template>
