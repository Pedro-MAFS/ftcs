<script setup lang="ts">
import Icon from '../shared/Icon.vue'
import { useMainViewTabs } from '../../composables/useMainViewTabs'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'

const { tabs, activeId, settingsCover, activateTab, closeTab, openPageTab } = useMainViewTabs()
const { fill, enterFill, exitFill } = useWorkspaceLayout()

function tabSelected(id: string): boolean {
  return !settingsCover.value && activeId.value === id
}
</script>

<template>
  <div class="main-tab-bar">
    <div class="main-tab-bar__tabs" role="tablist" aria-label="主视图标签">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="main-tab"
        role="tab"
        :class="{ 'is-active': tabSelected(tab.id), 'is-pinned': tab.id === 'page:home' }"
        :aria-selected="tabSelected(tab.id)"
        tabindex="0"
        @click="activateTab(tab.id)"
        @keydown.enter="activateTab(tab.id)"
      >
        <span class="main-tab__title">{{ tab.title }}</span>
        <button
          v-if="tab.id !== 'page:home'"
          type="button"
          class="main-tab__close"
          :aria-label="`关闭${tab.title}`"
          @click.stop="closeTab(tab.id)"
        >
          <Icon name="x" :size="12" />
        </button>
      </div>
      <button
        type="button"
        class="main-tab-bar__add"
        title="首页"
        aria-label="打开首页"
        @click="openPageTab('home')"
      >
        <Icon name="plus" :size="14" />
      </button>
    </div>
    <div class="main-tab-bar__fill">
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
        v-else-if="fill === 'main'"
        type="button"
        class="main-tab-bar__exit"
        aria-label="退出占满"
        @click="exitFill"
      >
        <Icon name="minimize-2" :size="14" />
        退出占满
      </button>
    </div>
  </div>
</template>
