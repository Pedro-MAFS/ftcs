<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import ConfirmDialog from '../shared/ConfirmDialog.vue'
import { useAuth } from '../../composables/useAuth'
import { openInboxPanel, useInbox } from '../../composables/useInbox'
import { useSettingsNav } from '../../composables/useSettingsNav'
import { PRODUCT_LINKS } from '../../config/links'
import { shareAppDownload } from '../../composables/useShareApp'

const open = ref(false)
const confirmLogout = ref(false)
const confirmLoginForFeedback = ref(false)
const confirmLoginForInbox = ref(false)
const hint = ref('')
const rootEl = ref<HTMLElement | null>(null)

const router = useRouter()
const { setCategory } = useSettingsNav()
const {
  session,
  loggedIn,
  loginPending,
  emailMasked,
  busy,
  login,
  cancelLogin,
  logout,
  openFeedback,
} = useAuth()
const { badgeLabel, unreadCount } = useInbox()

function toggle(): void {
  open.value = !open.value
  hint.value = ''
}

function close(): void {
  open.value = false
}

function onDocPointerDown(event: PointerEvent): void {
  if (!open.value || !rootEl.value) return
  const target = event.target as Node | null
  if (target && rootEl.value.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

async function onLogin(): Promise<void> {
  hint.value = '正在打开浏览器…'
  const res = await login()
  hint.value = res.message
  if (res.ok) close()
}

async function onCancelLogin(): Promise<void> {
  await cancelLogin()
  hint.value = '已取消登录'
}

function goAccount(): void {
  setCategory('account')
  close()
  void router.push({ name: 'settings' }).then(() => {
    void nextTick(() => {
      document
        .getElementById('settings-account')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

async function onFeedback(): Promise<void> {
  if (!loggedIn.value) {
    confirmLoginForFeedback.value = true
    return
  }
  const res = await openFeedback()
  hint.value = res.message
  if (res.ok) close()
}

function onMessages(): void {
  if (!loggedIn.value) {
    confirmLoginForInbox.value = true
    return
  }
  close()
  openInboxPanel()
}

async function confirmLoginThenInbox(): Promise<void> {
  confirmLoginForInbox.value = false
  const res = await login()
  if (!res.ok) {
    hint.value = res.message
    return
  }
  close()
  openInboxPanel()
}

async function openLink(url: string): Promise<void> {
  if (!window.ftcs?.openExternal) {
    hint.value = '当前环境无法打开外链'
    return
  }
  const res = await window.ftcs.openExternal(url)
  hint.value = res.ok ? '已在浏览器打开' : res.message
}

function openDocs(): void {
  void openLink(PRODUCT_LINKS.docs)
}

function openWebsite(): void {
  void openLink(PRODUCT_LINKS.website)
}

async function onShareApp(): Promise<void> {
  const res = await shareAppDownload()
  hint.value = res.message
}

async function confirmLoginThenFeedback(): Promise<void> {
  confirmLoginForFeedback.value = false
  const res = await login()
  if (!res.ok) {
    hint.value = res.message
    return
  }
  const fb = await openFeedback()
  hint.value = fb.message
  if (fb.ok) close()
}

function requestLogout(): void {
  confirmLogout.value = true
}

async function doLogout(): Promise<void> {
  confirmLogout.value = false
  const res = await logout()
  hint.value = res.message
  close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="auth-menu">
    <button
      v-if="loggedIn"
      type="button"
      class="auth-chip"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="账号"
      @click="toggle"
    >
      <span class="auth-chip__avatar">{{ (emailMasked || '?').slice(0, 1).toUpperCase() }}</span>
      <span class="auth-chip__label">{{ emailMasked || '已登录' }}</span>
      <span v-if="unreadCount > 0" class="auth-chip__badge">{{ badgeLabel }}</span>
      <Icon name="chevron-down" :size="12" />
    </button>
    <template v-else>
      <button
        type="button"
        class="auth-chip auth-chip--guest"
        title="分享应用（复制下载链接）"
        @click="onShareApp"
      >
        <Icon name="share-2" :size="12" />
        <span>分享</span>
      </button>
      <button
        type="button"
        class="auth-chip auth-chip--guest"
        :disabled="busy || loginPending"
        title="登录"
        @click="onLogin"
      >
        <Icon name="log-in" :size="12" />
        <span>{{ loginPending ? '登录中…' : '登录' }}</span>
      </button>
      <p v-if="hint && !open" class="auth-menu__toast">{{ hint }}</p>
    </template>

    <div
      v-if="open && loggedIn"
      class="auth-menu__panel"
      role="menu"
      aria-label="账号菜单"
    >
      <div class="auth-menu__head">
        <div class="auth-menu__name">{{ emailMasked }}</div>
        <div class="auth-menu__meta mono">
          {{ session.scopes.join(' · ') || '已授权' }}
        </div>
      </div>
      <div class="auth-menu__items">
        <button type="button" class="auth-menu__item" @click="goAccount">
          <Icon name="user" :size="14" />
          账号与授权
        </button>
        <button type="button" class="auth-menu__item" @click="onMessages">
          <Icon name="mail" :size="14" />
          消息
          <span v-if="unreadCount > 0" class="auth-menu__badge">{{ badgeLabel }}</span>
        </button>
        <button type="button" class="auth-menu__item" :disabled="busy" @click="onFeedback">
          <Icon name="message-square" :size="14" />
          意见反馈
        </button>
        <button type="button" class="auth-menu__item" @click="onShareApp">
          <Icon name="share-2" :size="14" />
          分享应用
        </button>
        <button type="button" class="auth-menu__item" @click="openWebsite">
          <Icon name="globe" :size="14" />
          产品官网
        </button>
        <button type="button" class="auth-menu__item" @click="openDocs">
          <Icon name="file-text" :size="14" />
          帮助文档
        </button>
        <button type="button" class="auth-menu__item is-danger" @click="requestLogout">
          <Icon name="log-out" :size="14" />
          退出登录
        </button>
      </div>
      <p v-if="hint" class="auth-menu__hint">{{ hint }}</p>
    </div>

    <button
      v-if="!loggedIn && loginPending"
      type="button"
      class="auth-chip auth-chip--guest"
      title="取消登录"
      @click="onCancelLogin"
    >
      取消
    </button>

    <ConfirmDialog
      :open="confirmLogout"
      title="退出登录？"
      message="退出后本地工作区数据仍保留，意见反馈等账号功能将不可用。"
      confirm-label="退出"
      danger
      :busy="busy"
      @confirm="doLogout"
      @cancel="confirmLogout = false"
    />
    <ConfirmDialog
      :open="confirmLoginForFeedback"
      title="需要先登录"
      message="意见反馈需要登录账号。是否打开浏览器完成授权？"
      confirm-label="去登录"
      :busy="busy"
      @confirm="confirmLoginThenFeedback"
      @cancel="confirmLoginForFeedback = false"
    />
    <ConfirmDialog
      :open="confirmLoginForInbox"
      title="需要先登录"
      message="查看站内信需要登录账号。是否打开浏览器完成授权？"
      confirm-label="去登录"
      :busy="busy"
      @confirm="confirmLoginThenInbox"
      @cancel="confirmLoginForInbox = false"
    />
  </div>
</template>
