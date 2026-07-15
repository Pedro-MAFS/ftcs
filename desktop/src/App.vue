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
  <div class="app-shell" :data-platform="platform">
    <header class="app-header" aria-label="窗口标题栏">
      <div class="brand">
        <span class="brand-mark">FT</span>
        <div>
          <h1>外贸获客智能体</h1>
          <p>Electron + OpenCode SDK（Server + Client）</p>
        </div>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
