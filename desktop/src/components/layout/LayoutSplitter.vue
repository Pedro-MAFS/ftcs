<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useWorkspaceLayout, type SplitterSide } from '../../composables/useWorkspaceLayout'

const props = defineProps<{
  side: SplitterSide
}>()

const { widths, draggingSide, canDragSplitter, beginSplitterDrag, updateSplitterDrag, endSplitterDrag } =
  useWorkspaceLayout()

const active = computed(() => canDragSplitter(props.side))
const dragging = computed(() => draggingSide.value === props.side)
const valueNow = computed(() => (props.side === 'left' ? widths.value.pipeline : widths.value.agent))

function onPointerDown(event: PointerEvent): void {
  if (!active.value || event.button !== 0) return
  event.preventDefault()
  const target = event.currentTarget
  if (target instanceof HTMLElement) target.setPointerCapture(event.pointerId)
  beginSplitterDrag(props.side, event.clientX)
}

function onPointerMove(event: PointerEvent): void {
  if (draggingSide.value !== props.side) return
  updateSplitterDrag(event.clientX)
}

function onPointerUp(): void {
  if (draggingSide.value !== props.side) return
  endSplitterDrag()
}

onUnmounted(() => {
  if (draggingSide.value === props.side) endSplitterDrag()
})
</script>

<template>
  <div
    class="layout-splitter"
    :class="{ 'is-active': active, 'is-dragging': dragging }"
    role="separator"
    aria-orientation="vertical"
    :aria-label="side === 'left' ? '调整产品栏宽度' : '调整智能体宽度'"
    :aria-disabled="active ? undefined : true"
    :aria-valuemin="side === 'left' ? 200 : 300"
    :aria-valuenow="valueNow"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  />
</template>
