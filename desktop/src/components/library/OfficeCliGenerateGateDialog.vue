<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    officeCount: number
    installSupported: boolean
    busy?: boolean
    progress?: string
    error?: string
    manualUrl?: string
  }>(),
  {
    busy: false,
    progress: '',
    error: '',
    manualUrl: '',
  },
)

const emit = defineEmits<{
  install: []
  skip: []
  cancel: []
  openManual: []
}>()

const message = computed(() => {
  const n = props.officeCount
  const base = `勾选资料中有 ${n} 个 Word/Excel/PPT 文件。生成画像前需安装 OfficeCLI（约 32MB，装到本应用目录）。也可跳过这些文件，仅用其余资料生成。`
  if (!props.installSupported) {
    return `${base}\n\n当前系统不支持一键安装 OfficeCLI（需 Windows 64 位）。可跳过这些 Office 文件继续，或取消。`
  }
  return base
})

function onKeydown(event: KeyboardEvent): void {
  if (!props.open || props.busy) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="需要 OfficeCLI"
    >
      <button
        type="button"
        class="confirm-dialog__backdrop"
        aria-label="关闭"
        :disabled="busy"
        @click="emit('cancel')"
      />
      <div class="confirm-dialog__panel office-gate-dialog__panel">
        <h3 class="confirm-dialog__title">需要 OfficeCLI</h3>
        <p class="confirm-dialog__message office-gate-dialog__message">{{ message }}</p>
        <p v-if="busy && progress" class="office-gate-dialog__progress">{{ progress }}</p>
        <p v-if="error" class="office-gate-dialog__error">{{ error }}</p>
        <button
          v-if="error && manualUrl"
          type="button"
          class="btn-secondary btn-sm office-gate-dialog__manual"
          :disabled="busy"
          @click="emit('openManual')"
        >
          查看安装说明
        </button>
        <div class="confirm-dialog__actions office-gate-dialog__actions">
          <button
            type="button"
            class="btn-secondary"
            :disabled="busy"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            type="button"
            class="btn-secondary"
            :disabled="busy"
            @click="emit('skip')"
          >
            跳过 Office 文件
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="busy || !installSupported"
            :title="
              installSupported ? '' : '当前仅支持 Windows 64 位一键安装'
            "
            @click="emit('install')"
          >
            {{ busy ? '安装中…' : '一键安装' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.office-gate-dialog__panel {
  width: min(440px, 100%);
}

.office-gate-dialog__message {
  white-space: pre-wrap;
}

.office-gate-dialog__progress {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.office-gate-dialog__error {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--danger, #e85d5d);
}

.office-gate-dialog__manual {
  margin-bottom: 12px;
}

.office-gate-dialog__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
