<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import TitleBar from './TitleBar.vue'
import ActivityRail from './ActivityRail.vue'
import Sidebar from './Sidebar.vue'
import AgentPanel from './AgentPanel.vue'
import StatusBar from './StatusBar.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import type { WorkspaceSection } from '../../types/workspace'

const route = useRoute()
const { setAgentContext } = useWorkspace()

const section = computed(() => (route.name as WorkspaceSection) ?? 'leads')

watch(
  section,
  (value) => {
    setAgentContext(value)
  },
  { immediate: true },
)
</script>

<template>
  <div class="workspace">
    <TitleBar :section="section" />
    <div class="workspace__body">
      <ActivityRail :section="section" />
      <Sidebar :section="section" />
      <main class="workspace__main">
        <RouterView />
      </main>
      <AgentPanel />
    </div>
    <StatusBar />
  </div>
</template>
