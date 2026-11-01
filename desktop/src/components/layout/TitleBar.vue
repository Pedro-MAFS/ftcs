<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '../shared/Icon.vue'
import RuntimePopover from './RuntimePopover.vue'
import AuthMenu from './AuthMenu.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useMainViewTabs } from '../../composables/useMainViewTabs'
import { useUiTheme } from '../../composables/useUiTheme'
import { oppositeExplicitTheme } from '../../utils/ui-theme'
import type { BuiltinBrowserUiState } from '../../types/electron'
import { builtinBrowserEntryLabel } from '../../../electron/browser-runtime/window-policy'

const { activeProduct } = useWorkspace()
const { openSettings } = useMainViewTabs()
const { effective, setMode } = useUiTheme()
const nextTheme = computed(() => oppositeExplicitTheme(effective.value))
const themeLabel = computed(() => (nextTheme.value === 'light' ? '切换到日间' : '切换到暗黑'))

function toggleTheme(): void {
  void setMode(nextTheme.value)
}

function openBrowser(): void {
  void window.ftcs?.showBuiltinBrowser?.()
}

const browserState = ref<BuiltinBrowserUiState>({
  alive: false,
  visible: false,
  mode: 'hidden',
  title: '内置浏览器',
  url: '尚未打开页面',
})
let stopBrowserState: (() => void) | null = null

const browserLabel = computed(() => builtinBrowserEntryLabel(browserState.value))
const browserLive = computed(() => browserLabel.value === '浏览中')

onMounted(() => {
  if (!window.ftcs?.getBuiltinBrowserState) return
  void window.ftcs.getBuiltinBrowserState().then((state) => {
    browserState.value = state
  })
  stopBrowserState = window.ftcs.onBuiltinBrowserState((state) => {
    browserState.value = state
  })
})

onUnmounted(() => {
  stopBrowserState?.()
})
</script>

<template>
  <header class="title-bar" aria-label="窗口标题栏">
    <div class="title-bar__left">
      <span class="title-bar__logo">FT</span>
      <span class="title-bar__brand">FTCS</span>
      <span class="title-bar__sep">/</span>
      <span class="title-bar__product">{{ activeProduct?.name ?? '未选择产品' }}</span>
    </div>

    <div class="title-bar__right">
      <button
        type="button"
        class="browser-entry"
        :class="{ 'is-live': browserLive }"
        :aria-label="browserLabel"
        @click="openBrowser"
      >
        <Icon name="app-window" :size="14" />
        <span>{{ browserLabel }}</span>
        <i v-if="browserLive" class="browser-entry__dot" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :title="themeLabel"
        :aria-label="themeLabel"
        @click="toggleTheme"
      >
        <Icon :name="nextTheme === 'light' ? 'sun' : 'moon'" :size="16" />
      </button>
      <RuntimePopover />
      <AuthMenu />
      <button
        type="button"
        class="icon-btn"
        title="设置"
        aria-label="设置"
        @click="openSettings"
      >
        <Icon name="settings" :size="16" />
      </button>
    </div>
  </header>
</template>
