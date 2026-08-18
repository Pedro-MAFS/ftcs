<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { LibraryContextItem } from './library-context'

const props = defineProps<{
  x: number
  y: number
  items: LibraryContextItem[]
}>()

const emit = defineEmits<{
  pick: [id: LibraryContextItem['id']]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const left = ref(props.x)
const top = ref(props.y)

async function clamp() {
  await nextTick()
  const el = menuRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const maxX = window.innerWidth - r.width - 8
  const maxY = window.innerHeight - r.height - 8
  left.value = Math.max(8, Math.min(props.x, maxX))
  top.value = Math.max(8, Math.min(props.y, maxY))
}

function onWindowMouseDown(e: MouseEvent) {
  const el = menuRef.value
  if (el && e.target instanceof Node && el.contains(e.target)) return
  emit('close')
}

function onWindowKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

function onWindowBlur() {
  emit('close')
}

watch(() => [props.x, props.y, props.items], () => {
  left.value = props.x
  top.value = props.y
  void clamp()
})

onMounted(() => {
  void clamp()
  window.addEventListener('mousedown', onWindowMouseDown, true)
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('blur', onWindowBlur)
})

onUnmounted(() => {
  window.removeEventListener('mousedown', onWindowMouseDown, true)
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <Teleport to="body">
    <ul
      ref="menuRef"
      class="library-ctx"
      role="menu"
      :style="{ left: `${left}px`, top: `${top}px` }"
      @contextmenu.prevent
    >
      <template v-for="item in items" :key="item.id">
        <li v-if="item.separatorBefore" class="library-ctx__sep" role="separator" />
        <li role="none">
          <button
            type="button"
            class="library-ctx__item"
            :class="{ 'is-danger': item.danger }"
            role="menuitem"
            :disabled="item.disabled"
            :title="item.hint || undefined"
            @click="!item.disabled && emit('pick', item.id)"
          >
            {{ item.label }}
          </button>
        </li>
      </template>
    </ul>
  </Teleport>
</template>
