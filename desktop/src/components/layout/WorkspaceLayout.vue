<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import TitleBar from './TitleBar.vue'
import ActivityRail from './ActivityRail.vue'
import Sidebar from './Sidebar.vue'
import LayoutSplitter from './LayoutSplitter.vue'
import MainTabBar from './MainTabBar.vue'
import AgentPanel from './AgentPanel.vue'
import StatusBar from './StatusBar.vue'
import UpdateBanner from '../update/UpdateBanner.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'
import { isBusinessPage, useMainViewTabs } from '../../composables/useMainViewTabs'
import { useDefaultLanding } from '../../composables/useDefaultLanding'
import { useUpdateCheck } from '../../composables/useUpdateCheck'

const route = useRoute()
const { setAgentContext } = useWorkspace()
const { settle } = useDefaultLanding()
const { bootstrapUpdateCheck } = useUpdateCheck()
const { fill, widths, setBodyWidth, noteSettingsOpen } = useWorkspaceLayout()
const { activeTab, settingsCover, cachedViewNames } = useMainViewTabs()

const bodyRef = ref<HTMLElement | null>(null)
let bodyObserver: ResizeObserver | null = null
const settingsOpen = computed(() => route.name === 'settings' || settingsCover.value)

watch(
  settingsOpen,
  (open) => {
    noteSettingsOpen(open)
  },
  { immediate: true },
)

watch(
  [activeTab, settingsCover],
  () => {
    if (settingsCover.value) return
    const tab = activeTab.value
    if (!tab || tab.kind !== 'page' || !isBusinessPage(tab.page)) return
    setAgentContext(tab.page)
  },
  { immediate: true },
)

onMounted(() => {
  void bootstrapUpdateCheck()
  void settle()
  const el = bodyRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  const publish = () => setBodyWidth(el.clientWidth)
  bodyObserver = new ResizeObserver(publish)
  bodyObserver.observe(el)
  publish()
})

onUnmounted(() => {
  bodyObserver?.disconnect()
  bodyObserver = null
})
</script>

<template>
  <div class="workspace">
    <TitleBar />
    <UpdateBanner />
    <div ref="bodyRef" class="workspace__body">
      <ActivityRail v-if="fill === 'none'" />
      <Sidebar v-if="fill === 'none'" :settings="settingsOpen" />
      <LayoutSplitter v-if="fill === 'none'" side="left" />
      <main
        v-if="fill !== 'agent'"
        class="workspace__main"
        :style="{ width: `${widths.main}px` }"
      >
        <MainTabBar />
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="cachedViewNames">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
      <LayoutSplitter v-if="fill === 'none'" side="right" />
      <AgentPanel v-if="fill !== 'main'" />
    </div>
    <StatusBar />
  </div>
</template>
