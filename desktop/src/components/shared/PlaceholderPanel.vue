<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  hint?: string
}>()
</script>

<template>
  <div class="placeholder-panel">
    <div class="placeholder-panel__body">
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
      <slot />
      <p v-if="hint" class="placeholder-panel__hint">{{ hint }}</p>
    </div>
  </div>
</template>
