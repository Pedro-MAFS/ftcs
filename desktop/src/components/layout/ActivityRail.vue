<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../shared/Icon.vue'
import { useMainViewTabs, type PageKey } from '../../composables/useMainViewTabs'

const { activeTab, settingsCover, openPageTab, openSettings } = useMainViewTabs()

const items: Array<{
  page: PageKey
  icon: 'package' | 'file-text' | 'radar' | 'users' | 'mail'
  label: string
}> = [
  { page: 'input', icon: 'package', label: '录入' },
  { page: 'profile', icon: 'file-text', label: '画像' },
  { page: 'explore', icon: 'radar', label: '探索' },
  { page: 'leads', icon: 'users', label: '线索' },
  { page: 'email', icon: 'mail', label: '邮件' },
]

const highlighted = computed(() => {
  if (settingsCover.value) return null
  const tab = activeTab.value
  if (!tab || tab.kind !== 'page' || tab.page === 'home') return null
  return tab.page
})
</script>

<template>
  <aside class="activity-rail" aria-label="模块导航">
    <button
      v-for="item in items"
      :key="item.page"
      type="button"
      class="rail-btn"
      :class="{ 'is-active': highlighted === item.page }"
      :title="item.label"
      :aria-label="item.label"
      @click="openPageTab(item.page)"
    >
      <Icon :name="item.icon" :size="18" />
    </button>
    <div class="rail-spacer" />
    <button
      type="button"
      class="rail-btn"
      :class="{ 'is-active': settingsCover }"
      title="设置"
      aria-label="设置"
      @click="openSettings"
    >
      <Icon name="sliders" :size="18" />
    </button>
  </aside>
</template>
