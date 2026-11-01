<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import TitleBar from './TitleBar.vue'
import ActivityRail from './ActivityRail.vue'
import Sidebar from './Sidebar.vue'
import LayoutSplitter from './LayoutSplitter.vue'
import AgentPanel from './AgentPanel.vue'
import StatusBar from './StatusBar.vue'
import UpdateBanner from '../update/UpdateBanner.vue'
import Icon from '../shared/Icon.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'
import { useDefaultLanding } from '../../composables/useDefaultLanding'
import { useUpdateCheck } from '../../composables/useUpdateCheck'
import type { WorkspaceSection } from '../../types/workspace'

const route = useRoute()
const { setAgentContext } = useWorkspace()
const { settle } = useDefaultLanding()
const { bootstrapUpdateCheck } = useUpdateCheck()
const { fill, widths, setBodyWidth, enterFill, exitFill } = useWorkspaceLayout()

const section = computed(() => (route.name as WorkspaceSection) ?? 'leads')
const bodyRef = ref<HTMLElement | null>(null)
let bodyObserver: ResizeObserver | null = null

watch(
  section,
  (value) => {
    setAgentContext(value)
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
    <TitleBar :section="section" />
    <UpdateBanner />
    <div ref="bodyRef" class="workspace__body">
      <ActivityRail v-if="fill === 'none'" :section="section" />
      <Sidebar v-if="fill === 'none'" :section="section" />
      <LayoutSplitter v-if="fill === 'none'" side="left" />
      <main
        v-if="fill !== 'agent'"
        class="workspace__main"
        :style="{ width: `${widths.main}px` }"
      >
        <div class="workspace__fill">
          <button
            v-if="fill === 'none'"
            type="button"
            class="icon-btn"
            title="占满"
            aria-label="主视图占满"
            @click="enterFill('main')"
          >
            <Icon name="maximize-2" :size="14" />
          </button>
          <button
            v-else
            type="button"
            class="workspace__fill-exit"
            aria-label="退出占满"
            @click="exitFill"
          >
            <Icon name="minimize-2" :size="14" />
            退出占满
          </button>
        </div>
        <RouterView />
      </main>
      <LayoutSplitter v-if="fill === 'none'" side="right" />
      <AgentPanel v-if="fill !== 'main'" />
    </div>
    <StatusBar />
  </div>
</template>
