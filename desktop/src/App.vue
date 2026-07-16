<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'

const platform = ref('win32')

onMounted(() => {
  platform.value = window.ftcs?.platform ?? 'win32'
  document.documentElement.dataset.platform = platform.value
})
</script>

<template>
  <div class="app-root" :data-platform="platform">
    <RouterView />
  </div>
</template>
