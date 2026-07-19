<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import ConfirmDialog from '../shared/ConfirmDialog.vue'
import { useAppStatus } from '../../composables/useAppStatus'
import { useSettingsNav } from '../../composables/useSettingsNav'

const MCP_META: Record<string, string> = {
  'lead-store': '线索读写',
  'search-api': 'Tavily 搜索',
  'chrome-devtools': '浏览器抓取',
}

const open = ref(false)
const confirmStop = ref(false)
const actionMessage = ref('')
const reconnecting = ref('')
const rootEl = ref<HTMLElement | null>(null)

const router = useRouter()
const { setCategory } = useSettingsNav()
const {
  status,
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
} = useAppStatus()

const statusClass = computed(() => {
  if (runtimeHealthy.value && runtimeState.value === 'running') return 'is-ready'
  if (runtimeState.value === 'error') return 'is-error'
  if (runtimeState.value === 'starting') return 'is-warn'
  if (mcpTotalCount.value > 0 && mcpConnectedCount.value < mcpTotalCount.value) {
    return 'is-warn'
  }
  return 'is-idle'
})

const healthLabel = computed(() => {
  if (runtimeHealthy.value && runtimeState.value === 'running') return 'healthy'
  if (runtimeState.value === 'starting') return 'starting'
  if (runtimeState.value === 'error') return 'error'
  if (runtimeState.value === 'stopped') return 'stopped'
  return runtimeState.value
})

const baseUrlLine = computed(() => {
  const oc = status.value?.opencode
  if (!oc) return '—'
  const ver = oc.version ? ` · v${oc.version}` : ''
  return `${oc.baseUrl}${ver}`
})

const canStart = computed(
  () =>
    !loading.value &&
    runtimeState.value !== 'running' &&
    runtimeState.value !== 'starting',
)
const canStop = computed(
  () => !loading.value && (runtimeState.value === 'running' || runtimeHealthy.value),
)
const canRestart = computed(() => !loading.value && runtimeState.value !== 'starting')

const chipExtra = computed(() => {
  if (runtimeState.value !== 'running' || mcpTotalCount.value === 0) return ''
  if (mcpConnectedCount.value < mcpTotalCount.value) {
    return ` · MCP ${mcpConnectedCount.value}/${mcpTotalCount.value}`
  }
  return ''
})

function mcpDesc(name: string): string {
  return MCP_META[name] || 'MCP 服务'
}

function mcpOk(statusText: string): boolean {
  return (statusText || '').toLowerCase() === 'connected'
}

function toggle(): void {
  open.value = !open.value
  if (open.value) {
    actionMessage.value = ''
    void refresh()
  }
}

function close(): void {
  open.value = false
}

function onDocPointerDown(event: PointerEvent): void {
  if (!open.value || !rootEl.value) return
  const target = event.target as Node | null
  if (target && rootEl.value.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    close()
  }
}

async function onStart(): Promise<void> {
  actionMessage.value = ''
  await startOpenCode()
  actionMessage.value = error.value || '已请求启动'
}

async function onRestart(): Promise<void> {
  actionMessage.value = ''
  await restartOpenCode()
  actionMessage.value = error.value || '已重启'
}

function requestStop(): void {
  if (agentRunning.value) {
    confirmStop.value = true
    return
  }
  void doStop()
}

async function doStop(): Promise<void> {
  confirmStop.value = false
  actionMessage.value = ''
  await stopOpenCode()
  actionMessage.value = error.value || '已停止'
}

async function onRefreshMcp(): Promise<void> {
  actionMessage.value = ''
  await refresh()
  actionMessage.value = '已刷新状态'
}

async function onReconnect(name: string): Promise<void> {
  reconnecting.value = name
  actionMessage.value = ''
  const err = await reconnectMcp(name)
  actionMessage.value = err || `${name} 已重连`
  reconnecting.value = ''
}

function goSettings(): void {
  setCategory('opencode')
  close()
  void router.push({ name: 'settings' }).then(() => {
    void nextTick(() => {
      document
        .getElementById('settings-opencode')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="runtime-popover">
    <button
      type="button"
      class="oc-status oc-status--btn"
      :class="statusClass"
      :aria-expanded="open"
      aria-haspopup="dialog"
      title="OpenCode 运行时"
      @click="toggle"
    >
      <i class="oc-status__dot" />
      <span>{{ runtimeLabel }}{{ chipExtra }}</span>
      <Icon name="chevron-down" :size="12" class="oc-status__chevron" />
    </button>

    <div
      v-if="open"
      class="runtime-popover__panel"
      role="dialog"
      aria-label="OpenCode 运行时"
    >
      <div class="runtime-popover__head">
        <div class="runtime-popover__head-row">
          <span class="runtime-popover__title">OpenCode 运行时</span>
          <span
            class="runtime-popover__badge"
            :class="{
              ok: healthLabel === 'healthy',
              err: healthLabel === 'error',
              warn: healthLabel === 'starting',
            }"
          >
            <i class="oc-status__dot" />
            {{ healthLabel }}
          </span>
        </div>
        <p class="runtime-popover__url mono">{{ baseUrlLine }}</p>
        <p v-if="status?.opencode?.error" class="runtime-popover__err">
          {{ status.opencode.error }}
        </p>
      </div>

      <div class="runtime-popover__actions">
        <button
          type="button"
          class="runtime-popover__action"
          :disabled="!canStop"
          @click="requestStop"
        >
          <Icon name="square" :size="12" class="is-danger" />
          停止
        </button>
        <button
          type="button"
          class="runtime-popover__action"
          :disabled="!canRestart"
          @click="onRestart"
        >
          <Icon name="refresh-cw" :size="12" class="is-accent" />
          {{ loading ? '处理中…' : '重启' }}
        </button>
        <button
          type="button"
          class="runtime-popover__action is-start"
          :disabled="!canStart"
          @click="onStart"
        >
          <Icon name="play" :size="12" class="is-accent" />
          启动
        </button>
      </div>

      <div class="runtime-popover__mcp">
        <div class="runtime-popover__mcp-head">
          <span>MCP 服务</span>
          <button
            type="button"
            class="runtime-popover__link-btn"
            :disabled="loading"
            @click="onRefreshMcp"
          >
            <Icon name="refresh-cw" :size="11" />
            刷新状态
          </button>
        </div>

        <ul v-if="mcpServers.length" class="runtime-popover__mcp-list">
          <li v-for="item in mcpServers" :key="item.name" class="runtime-popover__mcp-row">
            <i
              class="runtime-popover__mcp-dot"
              :class="{ ok: mcpOk(item.status), err: !mcpOk(item.status) }"
            />
            <div class="runtime-popover__mcp-meta">
              <span class="mono">{{ item.name }}</span>
              <span class="muted">{{ item.error || mcpDesc(item.name) }}</span>
            </div>
            <span
              class="runtime-popover__mcp-badge"
              :class="{ ok: mcpOk(item.status) }"
            >
              {{ item.status }}
            </span>
            <button
              v-if="!mcpOk(item.status)"
              type="button"
              class="runtime-popover__reconnect"
              :disabled="loading || reconnecting === item.name"
              @click="onReconnect(item.name)"
            >
              {{ reconnecting === item.name ? '…' : '重连' }}
            </button>
          </li>
        </ul>
        <p v-else class="runtime-popover__mcp-empty muted">
          OpenCode 未就绪或 MCP 尚未连接
        </p>
      </div>

      <div class="runtime-popover__foot">
        <span class="muted">
          {{
            agentRunning
              ? '有 Agent 任务在运行，停止将中断当前任务'
              : actionMessage || '运行中停止需确认'
          }}
        </span>
        <button type="button" class="runtime-popover__link-btn" @click="goSettings">
          打开设置 ↗
        </button>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmStop"
      title="停止 OpenCode？"
      message="当前有 Agent 任务正在运行，停止后任务将被中断。确定继续？"
      confirm-label="停止"
      danger
      :busy="loading"
      @confirm="doStop"
      @cancel="confirmStop = false"
    />
  </div>
</template>
