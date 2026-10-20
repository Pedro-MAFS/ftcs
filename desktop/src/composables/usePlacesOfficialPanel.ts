import { computed, ref } from 'vue'
import type { SettingsSnapshot } from '../types/settings'
import {
  canApplyPlacesOfficialKey,
  placesOfficialStatusLabel,
  placesOfficialSupplement,
} from '../domain/places-official'

export function usePlacesOfficialPanel(isLoggedIn: () => boolean) {
  const phase = ref<'loading' | 'ready' | 'error'>('loading')
  const status = ref<string | null>(null)
  const reason = ref<string | null>(null)
  const note = ref<string | null>(null)
  const errorText = ref('')
  const needLogin = ref(false)
  const busy = ref(false)

  const label = computed(() => placesOfficialStatusLabel(status.value))
  const extra = computed(() =>
    phase.value === 'ready'
      ? placesOfficialSupplement({
          status: status.value,
          reasonMessage: reason.value,
          expectedReadyNote: note.value,
        })
      : '',
  )
  const canApply = computed(
    () =>
      phase.value === 'ready' &&
      (status.value === 'none' || status.value === 'provision_failed') &&
      canApplyPlacesOfficialKey({
        loggedIn: isLoggedIn(),
        status: status.value,
      }),
  )

  function applyResult(res: {
    ok: boolean
    needLogin: boolean
    message: string
    queried: boolean
    settings: SettingsSnapshot
  }): void {
    if (!res.queried) {
      if (!res.ok && res.message) errorText.value = res.message
      if (res.needLogin) needLogin.value = true
      return
    }
    status.value = res.settings.placesOfficialStatus
    reason.value = res.settings.placesOfficialReasonMessage
    note.value = res.settings.placesOfficialExpectedReadyNote
    needLogin.value = res.settings.placesOfficialNeedLogin || res.needLogin
    errorText.value = res.settings.placesOfficialQueryError || (!res.ok ? res.message : '')
    phase.value = errorText.value ? 'error' : 'ready'
  }

  async function refresh(): Promise<void> {
    if (!window.ftcs?.refreshPlacesOfficialKey) {
      phase.value = 'error'
      errorText.value = '当前环境不能查询官方 Places Key'
      return
    }
    phase.value = 'loading'
    errorText.value = ''
    busy.value = true
    try {
      applyResult(await window.ftcs.refreshPlacesOfficialKey())
    } catch (err) {
      phase.value = 'error'
      status.value = null
      errorText.value = err instanceof Error ? err.message : String(err)
    } finally {
      busy.value = false
    }
  }

  async function apply(): Promise<void> {
    if (!window.ftcs?.applyPlacesOfficialKey) return
    busy.value = true
    try {
      const res = await window.ftcs.applyPlacesOfficialKey()
      applyResult(res)
      if (!res.ok && !res.queried && res.message) errorText.value = res.message
    } catch (err) {
      errorText.value = err instanceof Error ? err.message : String(err)
    } finally {
      busy.value = false
    }
  }

  return {
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
  }
}
