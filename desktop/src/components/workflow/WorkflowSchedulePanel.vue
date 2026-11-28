<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type {
  WorkflowPlan,
  WorkflowSchedule,
  WorkflowScheduleRecurrence,
} from '../../types/electron'
import { useWorkspace } from '../../composables/useWorkspace'
import { useWorkflowSchedules } from '../../composables/useWorkflowSchedules'
import { nextScheduledAt } from '../../../electron/schedule/workflow-schedule-types'
import ConfirmDialog from '../shared/ConfirmDialog.vue'
import Icon from '../shared/Icon.vue'

const props = defineProps<{
  plans: WorkflowPlan[]
}>()

const { products, activeProductId } = useWorkspace()

const windowsBackground = window.ftcs?.platform === 'win32'
const { schedules, loading, listError, reloadSchedules } = useWorkflowSchedules()
const now = ref(new Date())
const openMenu = ref<string | null>(null)
const deleteTarget = ref<WorkflowSchedule | null>(null)
const saving = ref(false)
const enablingBackground = ref(false)
const openAtLogin = ref(false)
const closeToTrayEnabled = ref(false)
const error = ref('')
const message = ref('')
const editorOpen = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  productId: '',
  planId: '',
  enabled: true,
  recurrence: 'daily' as WorkflowScheduleRecurrence,
  weekday: 1,
  timeLocal: '09:00',
})

const WEEKDAYS = [
  { value: 0, label: '周日' },
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
]

const canAdd = computed(() => schedules.value.length < 5)
const hasEnabledSchedule = computed(() => schedules.value.some((s) => s.enabled))
/** 定时需要：开机自启 + 关闭进托盘，缺任一则引导 */
const showBackgroundHint = computed(
  () => hasEnabledSchedule.value && (!openAtLogin.value || !closeToTrayEnabled.value),
)

const planNameById = computed(() => {
  const map = new Map<string, string>()
  for (const p of props.plans) map.set(p.id, p.name)
  return map
})

const productNameById = computed(() => {
  const map = new Map<string, string>()
  for (const p of products.value) map.set(p.id, p.name || p.id)
  return map
})

function scheduleName(s: WorkflowSchedule): string {
  return [productNameById.value.get(s.productId) || s.productId, planNameById.value.get(s.planId) || s.planId].join(' · ')
}

function frequency(s: WorkflowSchedule): string {
  return s.recurrence === 'daily' ? '每日' : '每' + WEEKDAYS[s.weekday ?? 0].label
}

const rows = computed(() => schedules.value.map(task => ({ task, next: nextScheduledAt(task, now.value) }))
  .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity)))

function dayLabel(date: Date): string {
  if (date.toDateString() === now.value.toDateString()) return '今天'
  const tomorrow = new Date(now.value)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return date.toDateString() === tomorrow.toDateString() ? '明天' : `${date.getMonth() + 1}/${date.getDate()}`
}

async function reloadBackgroundPrefs(): Promise<void> {
  if (!window.ftcs?.getSettings) return
  try {
    const data = await window.ftcs.getSettings()
    openAtLogin.value = data.openAtLogin === true
    closeToTrayEnabled.value = windowsBackground ? data.closeAction === 'background' : data.closeToTrayEnabled === true
  } catch {
    // ignore
  }
}

/** 一键开启定时所需的后台能力：开机自启 + 关闭进托盘 */
async function enableScheduleBackground(): Promise<void> {
  enablingBackground.value = true
  error.value = ''
  try {
    const api = window.ftcs
    if (!api) return
    if (!openAtLogin.value) {
      const result = await api.setOpenAtLogin?.(true)
      openAtLogin.value = result?.openAtLogin === true
      if (!result?.ok) throw new Error(result?.message || '未能开启开机自启。')
    }
    if (!closeToTrayEnabled.value) {
      if (windowsBackground) {
        const prefs = await api.setBackgroundPreferences({ closeAction: 'background' })
        closeToTrayEnabled.value = prefs.closeAction === 'background'
      } else {
        const result = await api.setCloseToTray?.(true)
        closeToTrayEnabled.value = result?.closeToTrayEnabled === true
      }
    }
    await reloadBackgroundPrefs()
    if (showBackgroundHint.value) throw new Error('请检查开机自启和关窗后台运行设置。')
    message.value = '已开启开机自启与关窗后台运行。'
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    enablingBackground.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  form.productId = activeProductId.value || products.value[0]?.id || ''
  form.planId = props.plans[0]?.id || ''
  form.enabled = true
  form.recurrence = 'daily'
  form.weekday = 1
  form.timeLocal = '09:00'
  editorOpen.value = true
  message.value = ''
  error.value = ''
}

function openEdit(s: WorkflowSchedule): void {
  openMenu.value = null
  editingId.value = s.id
  form.productId = s.productId
  form.planId = s.planId
  form.enabled = s.enabled
  form.recurrence = s.recurrence
  form.weekday = s.weekday ?? 1
  form.timeLocal = s.timeLocal
  editorOpen.value = true
  message.value = ''
  error.value = ''
}

async function onSave(): Promise<void> {
  if (saving.value || !window.ftcs?.saveWorkflowSchedule) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    let timeLocal = form.timeLocal.trim()
    const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal)
    if (m) {
      timeLocal = `${m[1]!.padStart(2, '0')}:${m[2]}`
    }
    const res = await window.ftcs.saveWorkflowSchedule({
      id: editingId.value ?? undefined,
      productId: form.productId,
      planId: form.planId,
      enabled: form.enabled,
      recurrence: form.recurrence,
      weekday: form.recurrence === 'weekly' ? form.weekday : null,
      timeLocal,
    })
    if (!res.ok) {
      error.value = res.message
      return
    }
    editorOpen.value = false
    message.value = '已保存定时任务'
    await reloadSchedules()

  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onToggle(s: WorkflowSchedule): Promise<void> {
  if (saving.value || !window.ftcs?.saveWorkflowSchedule) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const { id, productId, planId, recurrence, weekday, timeLocal } = s
    const res = await window.ftcs.saveWorkflowSchedule({ id, productId, planId, recurrence, weekday, timeLocal, enabled: !s.enabled })
    if (!res.ok) throw new Error(res.message)
    await reloadSchedules()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally { saving.value = false }
}

function leaveMenu(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) openMenu.value = null
}

async function onDelete() {
  const target = deleteTarget.value
  if (!target || saving.value || !window.ftcs?.deleteWorkflowSchedule) return
  saving.value = true
  error.value = ''
  try {
    const res = await window.ftcs.deleteWorkflowSchedule(target.id)
    if (!res.ok) throw new Error(res.message)
    if (editingId.value === target.id) editorOpen.value = false
    message.value = '已删除定时任务'
    await reloadSchedules()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
    deleteTarget.value = null
  }
}

let clock: number | undefined
function activate() {
  if (clock !== undefined) return
  now.value = new Date()
  clock = window.setInterval(() => { now.value = new Date() }, 30_000)
  void reloadSchedules()
  void reloadBackgroundPrefs()
}
function deactivate() {
  window.clearInterval(clock)
  clock = undefined
  openMenu.value = null
  deleteTarget.value = null
}
onActivated(activate)
onDeactivated(deactivate)
onUnmounted(deactivate)

let removeBackgroundListener: (() => void) | undefined
onUnmounted(() => removeBackgroundListener?.())
onMounted(() => {
  if (windowsBackground) removeBackgroundListener = window.ftcs?.onBackgroundPreferences(prefs => {
    openAtLogin.value = prefs.openAtLogin
    closeToTrayEnabled.value = prefs.closeAction === 'background'
  })
  activate()
})

watch(
  () => props.plans.length,
  () => {
    if (!form.planId && props.plans[0]) form.planId = props.plans[0].id
  },
)
</script>

<template>
  <section class="schedule-panel">
    <div class="schedule-panel__head">
      <h3>定时任务</h3>
      <span v-if="!rows.length && !listError" class="schedule-empty">{{ loading ? '加载中…' : '暂无定时任务' }}</span>
      <button type="button" class="btn-primary" :disabled="!canAdd || saving || loading || !!listError"
        :title="canAdd ? '新建定时任务' : '最多 5 条'" @click="openCreate">
        <Icon name="plus" :size="14" />新建任务
      </button>
    </div>
    <p v-if="listError" role="alert" class="schedule-panel__err">{{ listError }} <button type="button" @click="reloadSchedules">重试</button></p>
    <p v-if="error" role="alert" class="schedule-panel__err">{{ error }}</p>
    <p v-else-if="message" role="status" class="muted">{{ message }}</p>
    <ul v-if="rows.length" class="schedule-list">
      <li v-for="{ task, next } in rows" :key="task.id" class="schedule-item">
        <div class="schedule-item__time">
          <strong>{{ task.timeLocal }}</strong>
          <span>{{ next ? dayLabel(next) : '已停用' }}</span>
        </div>
        <div class="schedule-item__info">
          <strong>{{ scheduleName(task) }}</strong>
          <span class="muted">{{ frequency(task) }} {{ task.timeLocal }}</span>
        </div>
        <button type="button" class="schedule-switch" role="switch" :aria-checked="task.enabled"
          :aria-label="scheduleName(task) + '，启用定时任务'" :title="task.enabled ? '停用' : '启用'"
          :disabled="saving" @click="onToggle(task)"><span /></button>
        <div class="schedule-menu" @focusout="leaveMenu" @keydown.esc.stop="openMenu = null">
          <button type="button" class="btn-ghost" aria-label="更多操作" :aria-expanded="openMenu === task.id"
            :disabled="saving" @click="openMenu = openMenu === task.id ? null : task.id">•••</button>
          <div v-if="openMenu === task.id" class="schedule-menu__items">
            <button type="button" @click="openEdit(task)">编辑</button>
            <button type="button" @click="deleteTarget = task; openMenu = null">删除</button>
          </div>
        </div>
      </li>
    </ul>
    <div v-if="showBackgroundHint" class="schedule-login-hint">
      <p>开启开机自启与关窗后台运行，让定时任务按计划执行。</p>
      <button type="button" class="btn-secondary" :disabled="enablingBackground" @click="enableScheduleBackground">
        {{ enablingBackground ? '开启中…' : '一键开启' }}
      </button>
    </div>
    <ConfirmDialog :open="!!deleteTarget" title="删除定时任务"
      :message="deleteTarget ? '确定删除「' + scheduleName(deleteTarget) + ' · ' + frequency(deleteTarget) + ' ' + deleteTarget.timeLocal + '」？' : ''"
      confirm-label="删除" danger :busy="saving" @confirm="onDelete" @cancel="deleteTarget = null" />
    <div v-if="editorOpen" class="schedule-editor">
      <h4>{{ editingId ? '编辑定时任务' : '新建定时任务' }}</h4>
      <label class="field">
        <span>产品</span>
        <select v-model="form.productId" class="text-input">
          <option v-if="!products.length" disabled value="">请先创建产品画像</option>
          <option v-for="p in products" :key="p.id" :value="p.id">
            {{ p.name || p.id }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>方案</span>
        <select v-model="form.planId" class="text-input">
          <option v-for="p in plans" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>频率</span>
        <select v-model="form.recurrence" class="text-input">
          <option value="daily">每日</option>
          <option value="weekly">每周</option>
        </select>
      </label>
      <label v-if="form.recurrence === 'weekly'" class="field">
        <span>星期</span>
        <select v-model.number="form.weekday" class="text-input">
          <option v-for="d in WEEKDAYS" :key="d.value" :value="d.value">
            {{ d.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>时刻</span>
        <input v-model="form.timeLocal" class="text-input" type="time" />
      </label>
      <label class="settings-checkbox">
        <input v-model="form.enabled" type="checkbox" />
        <span>启用</span>
      </label>
      <div class="schedule-editor__actions">
        <button type="button" class="btn-secondary" @click="editorOpen = false">
          取消
        </button>
        <button type="button" class="btn-primary" :disabled="saving || !form.productId || !form.planId" @click="onSave">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.schedule-panel {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border, #333);
  border-radius: 8px;
}
.schedule-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.schedule-panel__head h3 {
  margin: 0;
  font-size: 14px;
}
.schedule-login-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #f59e0b 45%, transparent);
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  font-size: 12px;
  line-height: 1.45;
}
.schedule-login-hint p {
  margin: 0;
  flex: 1 1 220px;
}
.schedule-panel__err {
  color: #f87171;
  font-size: 12px;
}
.schedule-list { list-style: none; margin: 10px 0 0; padding: 0; }
.schedule-item { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border-subtle); }
.schedule-item__time, .schedule-item__info { display: grid; gap: 2px; }
.schedule-item__time strong { font-size: 17px; font-variant-numeric: tabular-nums; }
.schedule-item__time span, .schedule-item__info span { font-size: 12px; color: var(--text-secondary); }
.schedule-item__info strong { overflow-wrap: anywhere; }
.schedule-switch { width: 30px; height: 18px; border: 1px solid var(--border); padding: 2px; border-radius: 12px; background: var(--bg-active); }
.schedule-switch span { display: block; width: 12px; height: 12px; border-radius: 50%; background: var(--text-secondary); }
.schedule-switch[aria-checked="true"] { background: var(--accent); border-color: var(--accent); }
.schedule-switch[aria-checked="true"] span { background: white; transform: translateX(12px); }
.schedule-menu { position: relative; }
.schedule-menu__items { position: absolute; z-index: 3; top: 100%; right: 0; min-width: 76px; padding: 4px; display: grid; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: 0 4px 14px rgb(0 0 0 / 18%); }
.schedule-menu__items button { text-align: left; white-space: nowrap; }
.schedule-menu__items button:hover { background: var(--bg-hover); }
.schedule-empty { flex: 1; font-size: 12px; color: var(--text-secondary); }
.schedule-editor {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #333);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.schedule-editor h4 {
  margin: 0;
  font-size: 13px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.schedule-editor__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-ghost {
  background: transparent;
  border: none;
  color: var(--text-muted, #aaa);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
}
.btn-ghost:hover {
  color: var(--text, #eee);
}
</style>
