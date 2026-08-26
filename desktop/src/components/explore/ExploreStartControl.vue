<script setup lang="ts">
import Icon from '../shared/Icon.vue'

export type ExploreStartRound = 'R1' | 'R2'

const props = withDefaults(
  defineProps<{
    round: ExploreStartRound
    disabled: boolean
    disabledReason: string
    busy: boolean
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  'update:round': [value: ExploreStartRound]
  start: []
}>()

function onRoundChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'R1' || value === 'R2') emit('update:round', value)
}
</script>

<template>
  <div class="explore-start" :class="{ 'is-compact': props.compact }">
    <select
      class="text-input explore-start__round"
      :value="props.round"
      :disabled="props.busy"
      aria-label="选择探索轮次"
      @change="onRoundChange"
    >
      <option value="R1">R1 广撒网</option>
      <option value="R2">R2 社媒发现</option>
    </select>
    <button
      type="button"
      class="btn-primary explore-start__run"
      :class="{ 'btn-secondary--sm': props.compact }"
      :disabled="props.disabled"
      :title="props.disabled ? props.disabledReason : `按当前选择执行${props.round === 'R2' ? '社媒发现' : '广撒网'}`"
      @click="emit('start')"
    >
      <Icon name="play" :size="props.compact ? 11 : 12" />
      {{ props.busy ? '探索中…' : '开始探索' }}
    </button>
  </div>
</template>
