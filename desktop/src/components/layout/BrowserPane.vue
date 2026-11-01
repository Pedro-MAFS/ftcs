<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { useMainViewTabs } from '../../composables/useMainViewTabs'
import type { BuiltinBrowserSlot } from '../../types/electron'

const { activeTab, browserChrome } = useMainViewTabs()
const placeholder = ref<HTMLElement | null>(null)
const address = ref('')
const editing = ref(false)
let observer: ResizeObserver | null = null

const browserTab = computed(() => {
  const tab = activeTab.value
  return tab && tab.kind === 'browser' ? tab : null
})

const secure = computed(() => {
  try {
    return new URL(browserTab.value?.url || '').protocol === 'https:'
  } catch {
    return false
  }
})

const pageOpen = computed(() => /^https?:\/\//i.test(browserTab.value?.url ?? ''))

const startCards = [
  { icon: 'globe' as const, title: '看官网', detail: '确认这家公司是不是你要找的客户' },
  { icon: 'package' as const, title: '看产品', detail: '对照画像里的品类、用途和规格' },
  { icon: 'mail' as const, title: '找联系人', detail: '在联系页或 About 里找邮箱' },
]

const chrome = computed(() => {
  const key = browserTab.value?.browserKey
  if (!key) return { canGoBack: false, canGoForward: false }
  return browserChrome.value[key] ?? { canGoBack: false, canGoForward: false }
})

watch(
  () => browserTab.value?.url,
  (url) => {
    if (!editing.value) address.value = url && !url.startsWith('about:') ? url : ''
  },
  { immediate: true },
)

watch(
  () => [browserTab.value?.browserKey, browserTab.value?.url] as const,
  () => {
    reportSlot(true)
  },
)

function reportSlot(visible: boolean): void {
  const tab = browserTab.value
  const el = placeholder.value
  const api = window.ftcs?.setBuiltinBrowserSlot
  if (!api) return
  if (!tab || !el) {
    void api(emptySlot(tab?.browserKey ?? '', false))
    return
  }
  const rect = el.getBoundingClientRect()
  const shown =
    visible &&
    pageOpen.value &&
    document.visibilityState === 'visible' &&
    rect.width > 0 &&
    rect.height > 0
  const slot: BuiltinBrowserSlot = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    visible: shown,
    browserKey: tab.browserKey,
  }
  void api(slot)
}

function emptySlot(browserKey: string, visible: boolean): BuiltinBrowserSlot {
  return { x: 0, y: 0, width: 0, height: 0, visible, browserKey }
}

function onAddressFocus(): void {
  editing.value = true
}

function onAddressBlur(): void {
  editing.value = false
  const url = browserTab.value?.url
  address.value = url && !url.startsWith('about:') ? url : ''
}

function onSubmit(): void {
  const tab = browserTab.value
  const raw = address.value.trim()
  if (!tab || !raw) return
  editing.value = false
  void window.ftcs?.navigateBuiltinBrowser?.(tab.browserKey, raw)
}

function control(action: 'back' | 'forward' | 'reload'): void {
  const tab = browserTab.value
  if (!tab) return
  void window.ftcs?.controlBuiltinBrowser?.(tab.browserKey, action)
}

function onVisibility(): void {
  reportSlot(document.visibilityState === 'visible')
}

onMounted(() => {
  const el = placeholder.value
  if (el && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => reportSlot(true))
    observer.observe(el)
  }
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  reportSlot(true)
})

function onResize(): void {
  reportSlot(true)
}

onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
  const key = browserTab.value?.browserKey ?? ''
  void window.ftcs?.setBuiltinBrowserSlot?.(emptySlot(key, false))
})
</script>

<template>
  <section class="browser-pane" aria-label="浏览器">
    <div class="browser-pane__bar">
      <button
        type="button"
        class="icon-btn"
        title="后退"
        aria-label="后退"
        :disabled="!chrome.canGoBack"
        @click="control('back')"
      >
        <Icon name="chevron-left" :size="16" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="前进"
        aria-label="前进"
        :disabled="!chrome.canGoForward"
        @click="control('forward')"
      >
        <Icon name="chevron-right" :size="16" />
      </button>
      <button type="button" class="icon-btn" title="刷新" aria-label="刷新" @click="control('reload')">
        <Icon name="refresh-cw" :size="14" />
      </button>
      <form class="browser-pane__address" @submit.prevent="onSubmit">
        <Icon v-if="secure" name="lock" :size="14" />
        <input
          v-model="address"
          type="text"
          spellcheck="false"
          aria-label="地址"
          placeholder="输入网址"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
        />
      </form>
    </div>
    <div ref="placeholder" class="browser-pane__page">
      <div v-if="!pageOpen" class="browser-start">
        <div class="browser-start__mark" aria-hidden="true">
          <Icon name="globe" :size="26" />
        </div>
        <h2 class="browser-start__title">打开客户网站</h2>
        <p class="browser-start__detail">在上面的地址栏输入网址并回车，页面会显示在这里。</p>
        <div class="browser-start__cards">
          <article v-for="card in startCards" :key="card.title" class="browser-start__card">
            <h3 class="browser-start__card-title">
              <Icon :name="card.icon" :size="14" />
              {{ card.title }}
            </h3>
            <p class="browser-start__card-detail">{{ card.detail }}</p>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
