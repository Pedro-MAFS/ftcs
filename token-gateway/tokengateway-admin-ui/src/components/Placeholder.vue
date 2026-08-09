<script setup lang="ts">
defineProps<{
  title: string
  story: string
  detail: string
}>()
</script>

<template>
  <div class="card">
    <h2>{{ title }}</h2>
    <p class="story">{{ story }}</p>
    <p class="detail">{{ detail }}</p>
  </div>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
  max-width: 42rem;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.story {
  margin: 0 0 0.5rem;
  color: var(--accent);
  font-size: 0.9rem;
}

.detail {
  margin: 0;
  color: var(--muted);
}
</style>
