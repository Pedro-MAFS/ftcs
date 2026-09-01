import { computed, onMounted, onUnmounted, ref } from 'vue'
import { emptyAuthSession, type AuthActionResult, type AuthSessionSnapshot } from '../types/auth'

const session = ref<AuthSessionSnapshot>(emptyAuthSession())
const busy = ref(false)
const message = ref('')
const gatewayResetPromptOpen = ref(false)
const gatewayResetBusy = ref(false)
let subscribers = 0
let unsubChanged: (() => void) | undefined

async function refreshSession(): Promise<void> {
  if (!window.ftcs?.getAuthSession) {
    session.value = emptyAuthSession()
    return
  }
  try {
    session.value = await window.ftcs.getAuthSession()
  } catch {
    session.value = emptyAuthSession()
  }
}

async function login(): Promise<AuthActionResult> {
  if (!window.ftcs?.loginWithOAuth) {
    return {
      ok: false,
      message: '当前环境不支持登录',
      session: session.value,
    }
  }
  busy.value = true
  message.value = '正在打开浏览器完成授权…'
  try {
    // 先刷新一次以拿到 loginPending（主进程会很快进入 pending）
    void refreshSession()
    const res = await window.ftcs.loginWithOAuth()
    session.value = res.session
    message.value = res.message
    if (res.ok && res.promptGatewayReset) {
      gatewayResetPromptOpen.value = true
    }
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.value = msg
    await refreshSession()
    return { ok: false, message: msg, session: session.value }
  } finally {
    busy.value = false
  }
}

async function cancelLogin(): Promise<void> {
  if (!window.ftcs?.cancelOAuthLogin) return
  busy.value = true
  try {
    const res = await window.ftcs.cancelOAuthLogin()
    session.value = res.session
    message.value = res.message
  } finally {
    busy.value = false
  }
}

async function logout(): Promise<AuthActionResult> {
  if (!window.ftcs?.logoutOAuth) {
    return { ok: false, message: '当前环境不支持退出', session: session.value }
  }
  busy.value = true
  try {
    const res = await window.ftcs.logoutOAuth()
    session.value = res.session
    message.value = res.message
    return res
  } finally {
    busy.value = false
  }
}

function dismissGatewayResetPrompt(): void {
  gatewayResetPromptOpen.value = false
}

async function confirmGatewayReset(): Promise<void> {
  if (!window.ftcs?.provisionOfficialChannel) {
    dismissGatewayResetPrompt()
    return
  }
  gatewayResetBusy.value = true
  try {
    const res = await window.ftcs.provisionOfficialChannel({ reset: true })
    message.value = res.ok ? res.message : res.message
  } catch (err) {
    message.value = err instanceof Error ? err.message : String(err)
  } finally {
    gatewayResetBusy.value = false
    gatewayResetPromptOpen.value = false
  }
}

async function openFeedback(): Promise<AuthActionResult> {
  if (!window.ftcs?.openFeedback) {
    return { ok: false, message: '当前环境不支持意见反馈', session: session.value }
  }
  busy.value = true
  try {
    const res = await window.ftcs.openFeedback()
    session.value = res.session
    message.value = res.message
    return res
  } finally {
    busy.value = false
  }
}

const loggedIn = computed(() => session.value.loggedIn)
const loginPending = computed(() => session.value.loginPending || busy.value)
const emailMasked = computed(() => session.value.emailMasked)

/** 供站内信等模块在 setup 外监听登录态 */
export const authLoggedIn = loggedIn

export function useAuth() {
  onMounted(() => {
    subscribers += 1
    void refreshSession()
    if (!unsubChanged && window.ftcs?.onAuthChanged) {
      unsubChanged = window.ftcs.onAuthChanged((next) => {
        session.value = next
      })
    }
  })

  onUnmounted(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0 && unsubChanged) {
      unsubChanged()
      unsubChanged = undefined
    }
  })

  return {
    session,
    busy,
    message,
    loggedIn,
    loginPending,
    emailMasked,
    gatewayResetPromptOpen,
    gatewayResetBusy,
    refreshSession,
    login,
    cancelLogin,
    logout,
    openFeedback,
    dismissGatewayResetPrompt,
    confirmGatewayReset,
  }
}
