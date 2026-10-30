<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../shared/Icon.vue'

export type ExploreStartRound = 'R1' | 'R2' | 'R3'

const props = withDefaults(
  defineProps<{
    round: ExploreStartRound
    disabled: boolean
    disabledReason: string
    busy: boolean
    compact?: boolean
    anchorGuide?: boolean
  }>(),
  { compact: false, anchorGuide: false },
)

const emit = defineEmits<{
  'update:round': [value: ExploreStartRound]
  start: []
}>()

function onRoundChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'R1' || value === 'R2' || value === 'R3') {
    emit('update:round', value)
  }
}

const runLabel = computed(() => {
  if (props.busy) return '探索中…'
  if (props.round === 'R3') return '开始地图发现'
  if (props.round === 'R2') return '开始社媒发现'
  return '开始全网搜索'
})

const runTitle = computed(() => {
  if (props.disabled) return props.disabledReason
  if (props.round === 'R3') return '开始地图发现'
  if (props.round === 'R2') return '开始社媒发现'
  return '开始全网搜索'
})
</script>

<template>
  <div class="explore-start" :class="{ 'is-compact': props.compact }">
    <select
      class="text-input explore-start__round"
      :value="props.round"
      :disabled="props.busy"
      aria-label="选择探索方式"
      @change="onRoundChange"
    >
      <option value="R1">全网搜索</option>
      <option value="R2">社媒发现</option>
      <option value="R3">地图发现</option>
    </select>
    <button
      type="button"
      class="btn-primary explore-start__run"
      :class="{ 'btn-secondary--sm': props.compact }"
      :data-guide="props.anchorGuide ? 'og-explore-start' : undefined"
      :disabled="props.disabled"
      :title="runTitle"
      @click="emit('start')"
    >
      <Icon name="play" :size="props.compact ? 11 : 12" />
      {{ runLabel }}
    </button>
  </div>
</template>
