<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import TitleBar from './TitleBar.vue'
import ActivityRail from './ActivityRail.vue'
import Sidebar from './Sidebar.vue'
import AgentPanel from './AgentPanel.vue'
import StatusBar from './StatusBar.vue'
import UpdateBanner from '../update/UpdateBanner.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useUpdateCheck } from '../../composables/useUpdateCheck'
import type { WorkspaceSection } from '../../types/workspace'

const route = useRoute()
const { setAgentContext } = useWorkspace()
const { bootstrapUpdateCheck } = useUpdateCheck()

const section = computed(() => (route.name as WorkspaceSection) ?? 'leads')

watch(
  section,
  (value) => {
    setAgentContext(value)
  },
  { immediate: true },
)

onMounted(() => {
  void bootstrapUpdateCheck()
})
</script>

<template>
  <div class="workspace">
    <TitleBar :section="section" />
    <UpdateBanner />
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
