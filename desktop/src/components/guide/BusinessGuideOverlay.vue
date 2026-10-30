<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { GUIDE_STEPS, useBusinessGuide } from '../../composables/useBusinessGuide'

const { visible, step, next, skipAll, dismissSession } = useBusinessGuide()

const primaryRef = ref<HTMLButtonElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)
const hole = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const bubbleStyle = ref<Record<string, string>>({})

const spec = computed(() => GUIDE_STEPS[step.value] ?? GUIDE_STEPS[0])
const primaryLabel = computed(() => (step.value >= 4 ? '完成' : '下一步'))
const eyebrow = computed(() => `第 ${step.value + 1} 步，共 5 步`)

const topStyle = computed(() => shadeStyle(0, 0, '100%', hole.value ? `${hole.value.top}px` : '0'))
const leftStyle = computed(() =>
  hole.value
    ? shadeStyle(hole.value.top, 0, `${hole.value.left}px`, `${hole.value.height}px`)
    : {},
)
const rightStyle = computed(() =>
  hole.value
    ? {
        top: `${hole.value.top}px`,
        left: `${hole.value.left + hole.value.width}px`,
        right: '0',
        height: `${hole.value.height}px`,
      }
    : {},
)
const bottomStyle = computed(() =>
  hole.value
    ? {
        top: `${hole.value.top + hole.value.height}px`,
        left: '0',
        right: '0',
        bottom: '0',
      }
    : {},
)
const holeStyle = computed(() =>
  hole.value
    ? {
        left: `${hole.value.left}px`,
        top: `${hole.value.top}px`,
        width: `${hole.value.width}px`,
        height: `${hole.value.height}px`,
      }
    : {},
)

function shadeStyle(top: number, left: number, width: string, height: string) {
  return {
    top: `${top}px`,
    left: `${left}px`,
    width,
    height,
  }
}

function onShade(): void {
  dismissSession()
}

function onHole(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}

function onKey(event: KeyboardEvent): void {
  if (!visible.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  dismissSession()
}

async function place(): Promise<void> {
  if (!visible.value) {
    hole.value = null
    return
  }
  const name = spec.value?.guide
  const el = name ? document.querySelector(`[data-guide="${name}"]`) : null
  if (!(el instanceof HTMLElement)) {
    hole.value = null
    return
  }
  let rect = el.getBoundingClientRect()
  const outside =
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  if (outside) {
    el.scrollIntoView({ block: 'nearest' })
    await nextTick()
    rect = el.getBoundingClientRect()
  }
  hole.value = {
    left: rect.left - 6,
    top: rect.top - 6,
    width: Math.max(32, rect.width + 12),
    height: Math.max(32, rect.height + 12),
  }
  await nextTick()
  const bubble = bubbleRef.value
  const width = 320
  const gap = 12
  const height = bubble?.offsetHeight ?? 188
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = rect.right + gap
  let top = Math.min(Math.max(8, rect.top), Math.max(8, vh - height - 8))
  if (left + width > vw - 8) {
    left = Math.min(Math.max(8, rect.left), Math.max(8, vw - width - 8))
    const below = rect.bottom + gap
    if (below + height <= vh - 8) top = below
    else top = Math.max(8, rect.top - gap - height)
  }
  bubbleStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  }
}

function onViewport(): void {
  void place()
}

watch(
  [visible, step],
  () => {
    void place()
  },
  { immediate: true },
)

watch(visible, (value) => {
  if (value) {
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onViewport)
    window.addEventListener('scroll', onViewport, true)
    void nextTick(() => primaryRef.value?.focus())
  } else {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onViewport)
    window.removeEventListener('scroll', onViewport, true)
    hole.value = null
  }
}, { immediate: true })

watch([visible, step, hole], () => {
  if (!visible.value || !hole.value) return
  void nextTick(() => primaryRef.value?.focus())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', onViewport)
  window.removeEventListener('scroll', onViewport, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && hole"
      class="business-guide"
      role="dialog"
      aria-modal="true"
      :aria-label="spec.title"
    >
      <div class="business-guide__shade" :style="topStyle" @click="onShade" />
      <div class="business-guide__shade" :style="leftStyle" @click="onShade" />
      <div class="business-guide__shade" :style="rightStyle" @click="onShade" />
      <div class="business-guide__shade" :style="bottomStyle" @click="onShade" />
      <div
        class="business-guide__shield"
        :style="holeStyle"
        @pointerdown="onHole"
        @mousedown="onHole"
        @click="onHole"
      />
      <div ref="bubbleRef" class="business-guide__bubble" :style="bubbleStyle">
        <p class="business-guide__eyebrow">{{ eyebrow }}</p>
        <h2>{{ spec.title }}</h2>
        <p>{{ spec.body }}</p>
        <div class="business-guide__actions">
          <button type="button" class="btn-secondary" @click="skipAll">跳过全部</button>
          <button ref="primaryRef" type="button" class="btn-primary" @click="next">
            {{ primaryLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.business-guide {
  position: fixed;
  inset: 0;
  z-index: 1150;
  pointer-events: none;
}

.business-guide__shade {
  position: absolute;
  pointer-events: auto;
  background: rgb(0 0 0 / 55%);
}

.business-guide__shield {
  position: absolute;
  z-index: 1;
  pointer-events: auto;
  background: transparent;
}

.business-guide__bubble {
  position: absolute;
  z-index: 2;
  pointer-events: auto;
  box-sizing: border-box;
  width: 320px;
  padding: 16px 16px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: 0 16px 48px rgb(0 0 0 / 45%);
}

.business-guide__bubble .business-guide__eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.business-guide__bubble h2 {
  margin: 8px 0 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
}

.business-guide__bubble p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.business-guide__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
