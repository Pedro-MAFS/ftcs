<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import RuntimePopover from './RuntimePopover.vue'
import AuthMenu from './AuthMenu.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useUiTheme } from '../../composables/useUiTheme'
import { oppositeExplicitTheme } from '../../utils/ui-theme'
import { SECTION_META, type WorkspaceSection } from '../../types/workspace'
import type { BuiltinBrowserUiState } from '../../types/electron'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()
const { activeProduct } = useWorkspace()
const { effective, setMode } = useUiTheme()
const nextTheme = computed(() => oppositeExplicitTheme(effective.value))
const themeLabel = computed(() => (nextTheme.value === 'light' ? '切换到日间' : '切换到暗黑'))

function toggleTheme(): void {
  void setMode(nextTheme.value)
}

const steps: WorkspaceSection[] = ['input', 'profile', 'explore', 'leads', 'email']

const browserState = ref<BuiltinBrowserUiState>({
  alive: false,
  visible: false,
  mode: 'thumbnail',
  title: '内置浏览器',
  url: '尚未打开页面',
})
let stopBrowserState: (() => void) | null = null

const browserLabel = computed(() =>
  browserState.value.alive && browserState.value.visible ? '浏览中' : '打开浏览窗',
)
const browserIcon = computed(() =>
  browserState.value.visible && browserState.value.mode === 'card' ? 'panel-top' : 'app-window',
)
const browserLive = computed(() => browserState.value.alive && browserState.value.visible)

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

function openBrowser(): void {
  void window.ftcs?.showBuiltinBrowser?.()
}

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
      <button
        type="button"
        class="browser-entry"
        :class="{ 'is-live': browserLive }"
        :aria-label="browserLabel"
        @click="openBrowser"
      >
        <Icon :name="browserIcon" :size="14" />
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
        @click="go('settings')"
      >
        <Icon name="settings" :size="16" />
      </button>
    </div>
  </header>
</template>
