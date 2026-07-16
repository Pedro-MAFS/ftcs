<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import { useAppStatus } from '../../composables/useAppStatus'
import { useWorkspace } from '../../composables/useWorkspace'
import { SECTION_META, type WorkspaceSection } from '../../types/workspace'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()
const { activeProduct } = useWorkspace()
const { runtimeHealthy, runtimeLabel, runtimeState } = useAppStatus()

const steps: WorkspaceSection[] = ['input', 'profile', 'explore', 'leads', 'email']

const statusClass = computed(() => {
  if (runtimeHealthy.value && runtimeState.value === 'running') return 'is-ready'
  if (runtimeState.value === 'error') return 'is-error'
  if (runtimeState.value === 'starting') return 'is-warn'
  return 'is-idle'
})

function go(section: WorkspaceSection): void {
  void router.push({ name: section })
}
</script>

<template>
  <header class="title-bar" aria-label="窗口标题栏">
    <div class="title-bar__left">
      <span class="title-bar__logo">FT</span>
      <span class="title-bar__brand">FTCS</span>
      <span class="title-bar__sep">/</span>
      <span class="title-bar__product">{{ activeProduct?.name ?? '未选择产品' }}</span>
    </div>

    <nav class="title-bar__pipeline" aria-label="流水线">
      <button
        v-for="step in steps"
        :key="step"
        type="button"
        class="pipeline-chip"
        :class="{ 'is-active': section === step }"
        @click="go(step)"
      >
        {{ SECTION_META[step].label }}
      </button>
    </nav>

    <div class="title-bar__right">
      <span class="oc-status" :class="statusClass">
        <i class="oc-status__dot" />
        {{ runtimeLabel }}
      </span>
      <button
        type="button"
        class="icon-btn"
        title="设置"
        aria-label="设置"
        @click="go('settings')"
      >
        <Icon name="settings" :size="16" />
      </button>
    </div>
  </header>
</template>
