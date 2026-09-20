<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import OnboardingOverlay from './components/onboarding/OnboardingOverlay.vue'
import InboxToast from './components/inbox/InboxToast.vue'
import AppToast from './components/shared/AppToast.vue'
import ConfirmDialog from './components/shared/ConfirmDialog.vue'
import { useAuth } from './composables/useAuth'
import { useInbox } from './composables/useInbox'
import { useScheduleRunner } from './composables/useScheduleRunner'
import { ensureUiThemeListener, useUiTheme } from './composables/useUiTheme'

const platform = ref('win32')
useInbox()
useScheduleRunner()
ensureUiThemeListener()
const { syncFromSettings } = useUiTheme()

const {
  gatewayResetPromptOpen,
  gatewayResetBusy,
  dismissGatewayResetPrompt,
  confirmGatewayReset,
} = useAuth()

onMounted(async () => {
  platform.value = window.ftcs?.platform ?? 'win32'
  document.documentElement.dataset.platform = platform.value
  try {
    const settings = await window.ftcs?.getSettings?.()
    if (settings?.uiThemeMode) syncFromSettings(settings.uiThemeMode)
  } catch {
    // ignore
  }
})
</script>

<template>
  <div class="app-root" :data-platform="platform">
    <RouterView />
    <OnboardingOverlay />
    <AppToast />
    <InboxToast />
    <ConfirmDialog
      :open="gatewayResetPromptOpen"
      title="检测到账号已切换"
      message="当前登录账号与上次不同。若已开通官方通道，本地网关凭证可能仍绑定上一账号，模型与搜索扣费会记到旧账号。是否立即重置网关凭证？"
      confirm-label="重置网关凭证"
      cancel-label="暂不重置"
      danger
      :busy="gatewayResetBusy"
      @confirm="confirmGatewayReset"
      @cancel="dismissGatewayResetPrompt"
    />
  </div>
</template>
