<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { usePlacesOfficialPanel } from '../../composables/usePlacesOfficialPanel'

const {
  loggedIn,
  loginPending,
  busy: authBusy,
  login,
} = useAuth()

const {
  phase,
  status,
  errorText,
  needLogin,
  busy,
  label,
  extra,
  canApply,
  refresh,
  apply,
} = usePlacesOfficialPanel(() => loggedIn.value)

const openingRecharge = ref(false)

onMounted(() => {
  void refresh()
})

watch(loggedIn, (value, previous) => {
  if (value && previous === false) void refresh()
})

async function onLogin(): Promise<void> {
  await login()
}

async function onRecharge(): Promise<void> {
  if (!window.ftcs?.openOfficialRecharge) return
  openingRecharge.value = true
  try {
    await window.ftcs.openOfficialRecharge()
  } finally {
    openingRecharge.value = false
  }
}
</script>

<template>
  <p class="hint-line">
    不想自己开通 Google Cloud 时可以申请。开通后 Key 发到这台电脑，Places 由本机直连 Google，不经 FTCS 服务器代查。你需要能访问 Google 的网络。费用按日计入官方余额，不走你自己的 GCP 账单。
  </p>
  <p v-if="phase === 'loading'" class="hint-line">查询中</p>
  <template v-else-if="phase === 'error'">
    <p class="hint-line is-error">{{ errorText || '查询官方 Places 状态失败' }}</p>
    <div class="settings-actions-row">
      <button
        type="button"
        class="btn-secondary btn-sm"
        :disabled="busy"
        @click="refresh"
      >
        重试
      </button>
      <button
        v-if="needLogin || !loggedIn"
        type="button"
        class="btn-primary btn-sm"
        :disabled="authBusy || loginPending"
        @click="onLogin"
      >
        {{ loginPending ? '登录中…' : '去登录' }}
      </button>
    </div>
  </template>
  <template v-else>
    <p class="hint-line">状态：{{ label }}</p>
    <p v-if="extra" class="hint-line">{{ extra }}</p>
    <p v-if="errorText" class="hint-line is-error">{{ errorText }}</p>
    <p
      v-if="status === 'arrears' || status === 'revoked'"
      class="hint-line"
    >
      如需使用自备 Places Key，请把模型通道切换为「自定义」。官方通道不会使用本机已保存的自备 Key。
    </p>
    <div class="settings-actions-row">
      <button
        v-if="!loggedIn"
        type="button"
        class="btn-primary btn-sm"
        :disabled="authBusy || loginPending"
        @click="onLogin"
      >
        {{ loginPending ? '登录中…' : '去登录' }}
      </button>
      <button
        v-else-if="canApply"
        type="button"
        class="btn-primary btn-sm"
        :disabled="busy"
        @click="apply"
      >
        {{ busy ? '提交中…' : status === 'provision_failed' ? '再次申请' : '申请官方 Places Key' }}
      </button>
      <button
        v-else-if="status === 'pending'"
        type="button"
        class="btn-secondary btn-sm"
        disabled
      >
        申请中
      </button>
      <button
        v-else-if="status === 'active'"
        type="button"
        class="btn-secondary btn-sm"
        :disabled="busy"
        @click="refresh"
      >
        刷新状态
      </button>
      <button
        v-if="loggedIn && status === 'arrears'"
        type="button"
        class="btn-primary btn-sm"
        :disabled="openingRecharge"
        @click="onRecharge"
      >
        {{ openingRecharge ? '打开中…' : '去充值' }}
      </button>
    </div>
  </template>
  <p class="hint-line">当前 R3 使用：官方下发 Key</p>
</template>
