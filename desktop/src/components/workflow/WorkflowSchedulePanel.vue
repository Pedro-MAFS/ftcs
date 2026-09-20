<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type {
  WorkflowPlan,
  WorkflowSchedule,
  WorkflowScheduleRecurrence,
} from '../../types/electron'
import { useWorkspace } from '../../composables/useWorkspace'
import Icon from '../shared/Icon.vue'

const props = defineProps<{
  plans: WorkflowPlan[]
}>()

const { products, activeProductId } = useWorkspace()

const schedules = ref<WorkflowSchedule[]>([])
const loading = ref(false)
const saving = ref(false)
const enablingLogin = ref(false)
const openAtLogin = ref(true)
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
const showLoginHint = computed(() => !openAtLogin.value)

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

function describeSchedule(s: WorkflowSchedule): string {
  const product = productNameById.value.get(s.productId) || s.productId
  const plan = planNameById.value.get(s.planId) || s.planId
  if (s.recurrence === 'weekly') {
    const day = WEEKDAYS.find((d) => d.value === s.weekday)?.label || '每周'
    return `${product} · ${plan} · 每${day} ${s.timeLocal}`
  }
  return `${product} · ${plan} · 每日 ${s.timeLocal}`
}

async function reloadLoginPref(): Promise<void> {
  if (!window.ftcs?.getSettings) return
  try {
    const data = await window.ftcs.getSettings()
    openAtLogin.value = data.openAtLogin === true
  } catch {
    // ignore
  }
}

async function reload(): Promise<void> {
  if (!window.ftcs?.listWorkflowSchedules) return
  loading.value = true
  error.value = ''
  try {
    const res = await window.ftcs.listWorkflowSchedules()
    schedules.value = res.ok ? res.schedules : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function enableOpenAtLogin(): Promise<void> {
  if (!window.ftcs?.setOpenAtLogin) return
  enablingLogin.value = true
  error.value = ''
  try {
    const res = await window.ftcs.setOpenAtLogin(true)
    if (res.ok) {
      openAtLogin.value = true
      message.value = '已开启开机自启：登录 Windows 后会在托盘常驻，便于定时任务运行'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    enablingLogin.value = false
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
  if (!window.ftcs?.saveWorkflowSchedule) return
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
    message.value = form.enabled
      ? '已保存定时任务。请保持应用在托盘运行（关闭窗口不会退出）。'
      : '已保存定时任务'
    await reload()
    if (form.enabled && !openAtLogin.value) {
      message.value =
        '已保存定时任务。建议开启开机自启，否则关机后需手动打开应用才能到点执行。'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onToggle(s: WorkflowSchedule): Promise<void> {
  if (!window.ftcs?.saveWorkflowSchedule) return
  const res = await window.ftcs.saveWorkflowSchedule({
    id: s.id,
    productId: s.productId,
    planId: s.planId,
    enabled: !s.enabled,
    recurrence: s.recurrence,
    weekday: s.weekday,
    timeLocal: s.timeLocal,
  })
  if (!res.ok) {
    error.value = res.message
    return
  }
  await reload()
}

async function onDelete(s: WorkflowSchedule): Promise<void> {
  if (!window.ftcs?.deleteWorkflowSchedule) return
  if (!window.confirm(`删除定时任务「${describeSchedule(s)}」？`)) return
  const res = await window.ftcs.deleteWorkflowSchedule(s.id)
  if (!res.ok) {
    error.value = res.message
    return
  }
  message.value = '已删除'
  await reload()
}

onMounted(() => {
  void reload()
  void reloadLoginPref()
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
      <h3>定时运行</h3>
      <button
        type="button"
        class="btn-secondary"
        :disabled="!canAdd"
        :title="canAdd ? '新建定时任务' : '最多 5 条'"
        @click="openCreate"
      >
        新建
      </button>
    </div>
    <p class="muted schedule-panel__hint">
      <Icon name="info" :size="12" />
      绑定产品与方案，按每日/每周本地时刻自动执行。关闭窗口会藏到托盘（不退出）。最多 5 条。
    </p>
    <div v-if="showLoginHint" class="schedule-login-hint">
      <p>
        <strong>尚未开启开机自启。</strong>
        定时任务需要应用在后台运行；关机或重启后若未手动打开，将无法到点执行。
        <template v-if="hasEnabledSchedule">你已启用定时任务，建议现在开启。</template>
      </p>
      <button
        type="button"
        class="btn-primary"
        :disabled="enablingLogin"
        @click="enableOpenAtLogin"
      >
        {{ enablingLogin ? '开启中…' : '一键开启开机自启' }}
      </button>
    </div>
    <p v-if="error" class="schedule-panel__err">{{ error }}</p>
    <p v-else-if="message" class="muted">{{ message }}</p>
    <p v-if="loading" class="muted">加载中…</p>
    <ul v-else-if="schedules.length" class="schedule-list">
      <li v-for="s in schedules" :key="s.id" class="schedule-item">
        <div class="schedule-item__info">
          <strong>{{ describeSchedule(s) }}</strong>
          <span class="muted">{{ s.enabled ? '已启用' : '已关闭' }}</span>
        </div>
        <div class="schedule-item__actions">
          <button type="button" class="btn-ghost" @click="onToggle(s)">
            {{ s.enabled ? '关闭' : '启用' }}
          </button>
          <button type="button" class="btn-ghost" @click="openEdit(s)">编辑</button>
          <button type="button" class="btn-ghost" @click="onDelete(s)">删除</button>
        </div>
      </li>
    </ul>
    <p v-else class="muted">暂无定时任务</p>

    <div v-if="editorOpen" class="schedule-editor">
      <h4>{{ editingId ? '编辑定时任务' : '新建定时任务' }}</h4>
      <label class="field">
        <span>产品</span>
        <select v-model="form.productId" class="text-input">
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
        <button type="button" class="btn-primary" :disabled="saving" @click="onSave">
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
.schedule-panel__hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 8px 0;
  font-size: 12px;
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
.schedule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.schedule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.schedule-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.schedule-item__actions {
  display: flex;
  gap: 4px;
}
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
