<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '../shared/Icon.vue'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    disabled?: boolean
    disabledReason?: string
    canEdit?: boolean
    canDelete?: boolean
  }>(),
  {
    compact: true,
    disabled: false,
    disabledReason: '',
    canEdit: false,
    canDelete: false,
  },
)

const emit = defineEmits<{
  create: []
  edit: []
  delete: []
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const menuDisabled = computed(() => props.disabled)

const editTitle = computed(() =>
  props.canEdit ? '编辑当前方案' : '内置方案不可修改',
)
const deleteTitle = computed(() =>
  props.canDelete ? '删除当前方案' : '内置方案不可删除',
)

function toggleMenu(): void {
  if (menuDisabled.value) return
  open.value = !open.value
}

function closeMenu(): void {
  open.value = false
}

function onCreate(): void {
  closeMenu()
  emit('create')
}

function onEdit(): void {
  if (!props.canEdit) return
  closeMenu()
  emit('edit')
}

function onDelete(): void {
  if (!props.canDelete) return
  closeMenu()
  emit('delete')
}

function onDocPointerDown(event: PointerEvent): void {
  if (!open.value || !rootEl.value) return
  const target = event.target as Node | null
  if (target && rootEl.value.contains(target)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="workflow-plan-manage"
    :class="{ 'is-compact': compact, 'is-open': open }"
  >
    <button
      type="button"
      class="btn-secondary workflow-plan-manage__trigger"
      :class="{ 'btn-secondary--sm': compact }"
      :disabled="menuDisabled"
      :title="disabled && disabledReason ? disabledReason : '管理方案'"
      aria-label="管理方案"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggleMenu"
    >
      <Icon name="settings" :size="compact ? 11 : 12" />
    </button>
    <div v-if="open" class="workflow-plan-manage__panel" role="menu">
      <button type="button" class="workflow-plan-manage__item" role="menuitem" @click="onCreate">
        新建方案…
      </button>
      <button
        type="button"
        class="workflow-plan-manage__item"
        role="menuitem"
        :disabled="!canEdit"
        :title="editTitle"
        @click="onEdit"
      >
        编辑当前方案…
      </button>
      <button
        type="button"
        class="workflow-plan-manage__item is-danger"
        role="menuitem"
        :disabled="!canDelete"
        :title="deleteTitle"
        @click="onDelete"
      >
        删除当前方案…
      </button>
    </div>
  </div>
</template>
