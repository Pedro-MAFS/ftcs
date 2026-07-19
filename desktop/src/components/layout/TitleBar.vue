<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import RuntimePopover from './RuntimePopover.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { SECTION_META, type WorkspaceSection } from '../../types/workspace'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()
const { activeProduct } = useWorkspace()

const steps: WorkspaceSection[] = ['input', 'profile', 'explore', 'leads', 'email']

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
      <RuntimePopover />
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
