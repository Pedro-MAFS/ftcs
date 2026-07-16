<script setup lang="ts">
import { computed } from 'vue'
import { useAppStatus } from '../../composables/useAppStatus'

const { status } = useAppStatus()

const workspacePath = computed(() => status.value?.workspaceRoot ?? 'workspace/')
const shortPath = computed(() => {
  const p = workspacePath.value.replace(/\\/g, '/')
  const parts = p.split('/')
  if (parts.length <= 2) return p
  return `…/${parts.slice(-2).join('/')}`
})
</script>

<template>
  <footer class="status-bar" aria-label="状态栏">
    <div class="status-bar__left">
      <span :title="workspacePath">{{ shortPath }}</span>
      <span>Tavily —</span>
      <span>last run —</span>
    </div>
    <div class="status-bar__right">
      <span>main · Electron + OpenCode</span>
    </div>
  </footer>
</template>
