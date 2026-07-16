<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import type { WorkspaceSection } from '../../types/workspace'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()

const items: Array<{
  section: WorkspaceSection
  icon: 'package' | 'file-text' | 'radar' | 'users' | 'mail' | 'sliders'
  label: string
}> = [
  { section: 'input', icon: 'package', label: '录入' },
  { section: 'profile', icon: 'file-text', label: '画像' },
  { section: 'explore', icon: 'radar', label: '探索' },
  { section: 'leads', icon: 'users', label: '线索' },
  { section: 'email', icon: 'mail', label: '邮件' },
]

function go(section: WorkspaceSection): void {
  void router.push({ name: section })
}
</script>

<template>
  <aside class="activity-rail" aria-label="模块导航">
    <button
      v-for="item in items"
      :key="item.section"
      type="button"
      class="rail-btn"
      :class="{ 'is-active': section === item.section }"
      :title="item.label"
      :aria-label="item.label"
      @click="go(item.section)"
    >
      <Icon :name="item.icon" :size="18" />
    </button>
    <div class="rail-spacer" />
    <button
      type="button"
      class="rail-btn"
      :class="{ 'is-active': section === 'settings' }"
      title="设置"
      aria-label="设置"
      @click="go('settings')"
    >
      <Icon name="sliders" :size="18" />
    </button>
  </aside>
</template>
