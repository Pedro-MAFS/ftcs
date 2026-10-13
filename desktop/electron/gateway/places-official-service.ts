/**
 * 申请、查状态、取 Key、运行中 Google 拒绝后的一次状态查询。
 * 不把官方 Key 放进快照，失败时不改写来源。
 */
import {
  APPLY_NEED_LOGIN_MESSAGE,
  BYOK_PLACES_DETAIL,
  NETWORK_STATUS_MESSAGE,
  OFFICIAL_PLACES_DETAIL,
  applyErrorMessage,
  detailForOfficialKeyFailure,
  messageAfterGoogleRejectedKey,
  placesSourceForChannel,
  planPlacesRun,
  type PlacesKeySource,
} from '../../src/domain/places-official'
import type {
  PlacesCurrentResult,
  PlacesOfficialKeyClient,
  PlacesStatusResult,
} from './places-official-key-client'
import {
  PLACES_KEY_ARMING_RUN_ID,
  type PlacesOfficialKeyMemory,
} from './places-official-key-memory'
import type { PlacesMcpInjection } from '../opencode/places-mcp-env'

export interface PlacesSelection {
  channelMode: 'official' | 'custom'
  byokSet: boolean
  byokKey: string
}

export interface PlacesOfficialView {
  placesKeySource: '' | PlacesKeySource
  status: string | null
  reasonMessage: string | null
  expectedReadyNote: string | null
  queryError: string | null
  needLogin: boolean
}

export interface PlacesOfficialAction {
  ok: boolean
  needLogin: boolean
  message: string
  queried: boolean
  view: PlacesOfficialView
}

export interface PlacesRunBegin {
  ok: boolean
  message: string
  reloadBefore: boolean
  watchGoogleRejection: boolean
  releaseAfter: boolean
}

export interface PlacesOfficialServiceDeps {
  http: PlacesOfficialKeyClient
  memory: PlacesOfficialKeyMemory
  ensureToken: (options?: { force?: boolean }) => Promise<string | null>
  readSelection: () => PlacesSelection
  getInjection: () => PlacesMcpInjection
  setInjection: (next: PlacesMcpInjection) => void
  injectionNeedsReload: () => boolean
  now?: () => number
}

function blankView(source: PlacesKeySource): PlacesOfficialView {
  return {
    placesKeySource: source,
    status: null,
    reasonMessage: null,
    expectedReadyNote: null,
    queryError: null,
    needLogin: false,
  }
}

function viewFromStatus(
  source: PlacesKeySource,
  body: {
    status: string
    reasonMessage: string | null
    expectedReadyNote: string | null
  },
): PlacesOfficialView {
  return {
    placesKeySource: source,
    status: body.status,
    reasonMessage: body.reasonMessage,
    expectedReadyNote: body.expectedReadyNote,
    queryError: null,
    needLogin: false,
  }
}

export function createPlacesOfficialService(deps: PlacesOfficialServiceDeps) {
  const now = () => deps.now?.() ?? Date.now()

  async function callWithToken<T extends PlacesStatusResult | PlacesCurrentResult>(
    run: (token: string) => Promise<T>,
  ): Promise<T | PlacesStatusResult> {
    const token = await deps.ensureToken()
    if (!token) {
      return {
        ok: false,
        code: 'need_login',
        message: APPLY_NEED_LOGIN_MESSAGE,
      }
    }
    let result = await run(token)
    if (!result.ok && result.code === 'need_login') {
      const refreshed = await deps.ensureToken({ force: true })
      if (!refreshed) {
        return {
          ok: false,
          code: 'need_login',
          message: '登录已失效，请重新登录',
        }
      }
      result = await run(refreshed)
    }
    return result
  }

  function failureAction(
    failure: { code: string; message: string },
    queried: boolean,
  ): PlacesOfficialAction {
    const source = placesSourceForChannel(deps.readSelection().channelMode)
    const needLogin =
      failure.code === 'need_login' || failure.code === 'credential_revoked'
    const message =
      failure.code === 'credential_revoked'
        ? '登录凭证已吊销，请重新登录'
        : failure.code === 'need_login'
          ? failure.message || APPLY_NEED_LOGIN_MESSAGE
          : applyErrorMessage(failure.code, failure.message)
    return {
      ok: false,
      needLogin,
      message,
      queried,
      view: {
        ...blankView(source),
        queryError: queried ? message : null,
        needLogin,
      },
    }
  }

  async function refresh(): Promise<PlacesOfficialAction> {
    const res = await callWithToken((token) => deps.http.getStatus(token))
    if (!res.ok) return failureAction(res, true)
    const source = placesSourceForChannel(deps.readSelection().channelMode)
    return {
      ok: true,
      needLogin: false,
      message: '',
      queried: true,
      view: viewFromStatus(source, res.body),
    }
  }

  async function apply(): Promise<PlacesOfficialAction> {
    const res = await callWithToken((token) => deps.http.apply(token))
    if (!res.ok) return failureAction(res, false)
    return refresh()
  }

  async function fetchOfficialKey(runId: string): Promise<
    | { ok: true }
    | { ok: false; detail: string; needLogin: boolean }
  > {
    const cached = deps.memory.peek(runId, now())
    if (cached?.apiKey) return { ok: true }
    const res = await callWithToken((token) => deps.http.getCurrent(token))
    if (!res.ok || !('material' in res)) {
      deps.memory.clear()
      const failure = detailForOfficialKeyFailure({
        code: res.ok ? 'not_active' : res.code,
        status: res.ok ? null : res.status,
        reasonCode: res.ok ? null : res.reasonCode,
        byokSet: false,
        serverMessage: res.ok ? null : res.message,
      })
      return { ok: false, detail: failure.detail, needLogin: failure.needLogin }
    }
    deps.memory.hold({
      apiKey: res.material.apiKey,
      expiresAt: res.material.expiresAt,
      keyVersion: res.material.keyVersion,
      heldForRunId: runId,
      heldAt: now(),
    })
    return { ok: true }
  }

  async function prepareForPreflight(): Promise<{
    ok: boolean
    detail: string
    provider?: 'custom'
  }> {
    const selection = deps.readSelection()
    const plan = planPlacesRun({
      channelMode: selection.channelMode,
      byokSet: selection.byokSet,
    })
    if (plan.action === 'use-byok') {
      return { ok: true, detail: BYOK_PLACES_DETAIL, provider: 'custom' }
    }
    if (plan.action === 'fail') return { ok: false, detail: plan.detail }
    const fetched = await fetchOfficialKey(PLACES_KEY_ARMING_RUN_ID)
    if (!fetched.ok) return { ok: false, detail: fetched.detail }
    return { ok: true, detail: OFFICIAL_PLACES_DETAIL, provider: 'custom' }
  }

  async function beginRun(runId: string): Promise<PlacesRunBegin> {
    const selection = deps.readSelection()
    const plan = planPlacesRun({
      channelMode: selection.channelMode,
      byokSet: selection.byokSet,
    })
    if (plan.action === 'fail') {
      return {
        ok: false,
        message: plan.detail,
        reloadBefore: false,
        watchGoogleRejection: false,
        releaseAfter: false,
      }
    }
    if (plan.action === 'use-byok') {
      if (deps.getInjection().kind === 'official') {
        deps.setInjection({ kind: 'default' })
        return {
          ok: true,
          message: BYOK_PLACES_DETAIL,
          reloadBefore: deps.injectionNeedsReload(),
          watchGoogleRejection: false,
          releaseAfter: false,
        }
      }
      return {
        ok: true,
        message: BYOK_PLACES_DETAIL,
        reloadBefore: false,
        watchGoogleRejection: false,
        releaseAfter: false,
      }
    }
    const fetched = await fetchOfficialKey(runId)
    if (!fetched.ok) {
      return {
        ok: false,
        message: fetched.detail,
        reloadBefore: false,
        watchGoogleRejection: false,
        releaseAfter: false,
      }
    }
    const held = deps.memory.peek(runId, now())
    if (!held?.apiKey) {
      return {
        ok: false,
        message: NETWORK_STATUS_MESSAGE,
        reloadBefore: false,
        watchGoogleRejection: false,
        releaseAfter: false,
      }
    }
    deps.setInjection({ kind: 'official', apiKey: held.apiKey })
    return {
      ok: true,
      message: OFFICIAL_PLACES_DETAIL,
      reloadBefore: deps.injectionNeedsReload(),
      watchGoogleRejection: true,
      releaseAfter: true,
    }
  }

  function releaseRun(): { reload: boolean } {
    deps.memory.clear()
    if (deps.getInjection().kind === 'official') {
      deps.setInjection({ kind: 'default' })
    }
    return { reload: deps.injectionNeedsReload() }
  }

  async function handleGoogleRejection(googleMessage: string): Promise<string> {
    deps.memory.clear()
    if (deps.getInjection().kind === 'official') {
      deps.setInjection({ kind: 'default' })
    }
    const res = await callWithToken((token) => deps.http.getStatus(token))
    if (!res.ok) {
      return messageAfterGoogleRejectedKey({
        googleMessage,
        status: null,
        statusQueryOk: false,
      })
    }
    return messageAfterGoogleRejectedKey({
      googleMessage,
      status: res.body.status,
      statusQueryOk: true,
    })
  }

  return {
    apply,
    refresh,
    prepareForPreflight,
    beginRun,
    releaseRun,
    handleGoogleRejection,
    clearMemory: () => deps.memory.clear(),
  }
}

export type PlacesOfficialService = ReturnType<typeof createPlacesOfficialService>
