<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { isPinnedPageTab, useMainViewTabs } from '../../composables/useMainViewTabs'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'

const { tabs, activeId, settingsCover, activateTab, closeTab, openPageTab } = useMainViewTabs()
const { fill, enterFill, exitFill } = useWorkspaceLayout()

const mailboxUnread = ref(0)
watch(
  () => tabs.value.some((tab) => tab.id === 'page:mailbox'),
  (open, _, onCleanup) => {
    const api = window.ftcs?.mailbox
    mailboxUnread.value = 0
    if (!open || !api) return
    let sequence = 0
    async function refresh() {
      const request = ++sequence
      try {
        const count = await api!.unreadCount()
        if (request === sequence) mailboxUnread.value = count
      } catch {
        if (request === sequence) mailboxUnread.value = 0
      }
    }
    const unsubscribe = api.changed(refresh)
    onCleanup(() => {
      sequence++
      unsubscribe()
    })
    void refresh()
  },
  { immediate: true },
)

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
        :class="{ 'is-active': tabSelected(tab.id), 'is-pinned': isPinnedPageTab(tab.id) }"
        :aria-selected="tabSelected(tab.id)"
        tabindex="0"
        @click="activateTab(tab.id)"
        @keydown.enter="activateTab(tab.id)"
      >
        <span class="main-tab__title">{{ tab.title }}</span>
        <span
          v-if="tab.id === 'page:mailbox' && mailboxUnread > 0"
          class="main-tab__badge"
          :title="`${mailboxUnread} 封未读邮件`"
          :aria-label="`${mailboxUnread} 封未读邮件`"
        >{{ mailboxUnread > 99 ? '99+' : mailboxUnread }}</span>
        <button
          v-if="!isPinnedPageTab(tab.id)"
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
