import path from 'node:path'
import { shell } from 'electron'
import { ensureFreshTokens } from '../auth/oauth-service'
import { readEnvFile, upsertEnvFile, maskSecret } from '../config/env-file'
import { getWorkspaceRoot } from '../config/paths'
import {
  getOfficialModelCatalog,
  getSettingsSnapshot,
  type SettingsSnapshot,
} from '../settings/settings-service'
import {
  listModels,
  rotateKey,
  getUsageMe,
  createRechargeTicket,
  type GatewayClientError,
} from './gateway-client'
import {
  FTCS_GATEWAY_KEY_NAME,
  buildRechargePageUrl,
  buildPortalPageUrl,
  getDefaultTokenGatewayBaseUrl,
  getTokenGatewayBaseUrl,
  getTokenGatewayEnvKey,
  getTokenGatewayOrigin,
} from './gateway-config'
import {
  setOfficialModelsCache,
  type OfficialModelOption,
} from './official-models-cache'
import {
  buildUsageSnapshot,
  getOfficialUsageCache,
  setOfficialUsageCache,
  type OfficialUsageSnapshot,
} from './official-usage-cache'

const GATEWAY_KEY_ENV = 'FTCS_GATEWAY_API_KEY'
const CHANNEL_MODE_ENV = 'FTCS_CHANNEL_MODE'

export interface ProvisionOfficialResult {
  ok: boolean
  needLogin?: boolean
  message: string
  action?: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialModelsResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialUsageResult {
  ok: boolean
  message: string
  usage: OfficialUsageSnapshot | null
  settings: SettingsSnapshot
}

export interface OpenOfficialRechargeResult {
  ok: boolean
  needLogin?: boolean
  message: string
}

export type OpenOfficialPortalResult = OpenOfficialRechargeResult

/** 打开充值页后，主窗口 focus 时自动刷余额的窗口 */
const RECHARGE_FOCUS_REFRESH_WINDOW_MS = 15 * 60 * 1000
/** focus 自动刷余额最小间隔 */
const RECHARGE_FOCUS_REFRESH_MIN_GAP_MS = 10 * 1000

let lastRechargeOpenedAt = 0
let lastFocusUsageRefreshAt = 0

function getEnvPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.env')
}

function toOfficialOption(rawId: string): OfficialModelOption {
  const id = rawId.includes('/') ? rawId : `deepseek/${rawId}`
  const bare = id.includes('/') ? id.split('/').slice(1).join('/') : id
  return {
    id,
    rawId: bare,
    label: bare,
  }
}

function catalogAsOptions(): OfficialModelOption[] {
  return getOfficialModelCatalog().models.map((m) => toOfficialOption(m.id))
}

function pickModelsAfterFetch(
  rawIds: string[],
  currentModel: string,
  currentSmall: string,
): { model: string; smallModel: string; options: OfficialModelOption[] } {
  const options = rawIds.map((id) => toOfficialOption(id))
  const ids = new Set(options.map((o) => o.id))
  const bareToFull = new Map(options.map((o) => [o.rawId, o.id]))

  function normalize(sel: string, fallback: string): string {
    const t = sel.trim()
    if (ids.has(t)) return t
    const bare = t.includes('/') ? t.split('/').slice(1).join('/') : t
    if (bareToFull.has(bare)) return bareToFull.get(bare)!
    return fallback
  }

  const fallback = options[0]?.id || getOfficialModelCatalog().models[0].id
  const model = normalize(currentModel, fallback)
  const smallFallback =
    options.find((o) => o.rawId.includes('flash'))?.id || options[0]?.id || fallback
  const smallModel = normalize(currentSmall, smallFallback)
  return { model, smallModel, options }
}

/**
 * UC JWT → rotate → 写 sk / baseURL → 拉 models → 校正模型 id
 */
export async function provisionOfficialChannel(input?: {
  reset?: boolean
}): Promise<ProvisionOfficialResult> {
  const reset = Boolean(input?.reset)
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const baseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })

  let bundle = await ensureFreshTokens()
  if (!bundle?.accessToken) {
    return {
      ok: false,
      needLogin: true,
      message: '请先登录后再开通官方通道',
      settings: getSettingsSnapshot(),
    }
  }

  let rotate = await rotateKey({
    accessToken: bundle.accessToken,
    name: FTCS_GATEWAY_KEY_NAME,
    baseUrl,
  })

  if (!rotate.ok && rotate.code === 'need_login') {
    bundle = await ensureFreshTokens({ force: true })
    if (!bundle?.accessToken) {
      return {
        ok: false,
        needLogin: true,
        message: '登录已失效，请重新登录',
        settings: getSettingsSnapshot(),
      }
    }
    rotate = await rotateKey({
      accessToken: bundle.accessToken,
      name: FTCS_GATEWAY_KEY_NAME,
      baseUrl,
    })
  }

  if (!rotate.ok) {
    const err = rotate as GatewayClientError
    return {
      ok: false,
      needLogin: err.code === 'need_login',
      message: err.message,
      settings: getSettingsSnapshot(),
    }
  }

  const envUpdates: Record<string, string> = {
    [CHANNEL_MODE_ENV]: 'official',
    [GATEWAY_KEY_ENV]: rotate.apiKey,
    [getTokenGatewayEnvKey()]: baseUrl || getDefaultTokenGatewayBaseUrl(),
    // 官方搜索走网关（docs/15）；运行时也会按通道强制注入
    SEARCH_PROVIDER: 'gateway',
    SEARCH_DAILY_LIMIT: '999999',
  }

  const current = getSettingsSnapshot()
  const listed = await listModels({ apiKey: rotate.apiKey, baseUrl })
  let message =
    rotate.action === 'rotated' || reset
      ? '网关凭证已更新（旧 Key 已作废）。'
      : '官方通道已开通。'

  if (listed.ok) {
    const picked = pickModelsAfterFetch(
      listed.models.map((m) => m.id),
      current.model,
      current.smallModel,
    )
    envUpdates.FTCS_MODEL = picked.model
    envUpdates.FTCS_SMALL_MODEL = picked.smallModel
    setOfficialModelsCache(picked.options, 'gateway')
  } else {
    const fallback = catalogAsOptions()
    setOfficialModelsCache(fallback, 'fallback', listed.message)
    if (listed.code === 'empty_models') {
      message =
        rotate.action === 'rotated' || reset
          ? `网关凭证已更新（旧 Key 已作废）。${listed.message}`
          : listed.message
    } else {
      message += ` 模型列表未更新：${listed.message}`
    }
  }

  upsertEnvFile(envPath, envUpdates)
  Object.assign(process.env, envUpdates)
  process.env.FTCS_WORKSPACE = workspaceRoot

  await refreshOfficialUsage()

  return {
    ok: true,
    action: rotate.action,
    message,
    settings: getSettingsSnapshot(),
  }
}

/**
 * 已有 sk 时刷新 GET /models
 */
export async function refreshOfficialModels(): Promise<RefreshOfficialModelsResult> {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const apiKey = (env[GATEWAY_KEY_ENV] || process.env[GATEWAY_KEY_ENV] || '').trim()
  const baseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })

  if (!apiKey) {
    setOfficialModelsCache([], 'none', '请先开通官方通道')
    return {
      ok: false,
      message: '请先开通官方通道',
      settings: getSettingsSnapshot(),
    }
  }

  const listed = await listModels({ apiKey, baseUrl })
  if (!listed.ok) {
    const fallback = catalogAsOptions()
    setOfficialModelsCache(fallback, 'fallback', listed.message)
    return {
      ok: false,
      message: listed.message,
      settings: getSettingsSnapshot(),
    }
  }

  const current = getSettingsSnapshot()
  const picked = pickModelsAfterFetch(
    listed.models.map((m) => m.id),
    current.model,
    current.smallModel,
  )
  setOfficialModelsCache(picked.options, 'gateway')

  const envUpdates: Record<string, string> = {
    FTCS_MODEL: picked.model,
    FTCS_SMALL_MODEL: picked.smallModel,
  }
  upsertEnvFile(envPath, envUpdates)
  Object.assign(process.env, envUpdates)

  return {
    ok: true,
    message: `已加载 ${picked.options.length} 个官方模型`,
    settings: getSettingsSnapshot(),
  }
}

/**
 * 已有 sk 时刷新 GET /usage/me
 */
export async function refreshOfficialUsage(): Promise<RefreshOfficialUsageResult> {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const apiKey = (env[GATEWAY_KEY_ENV] || process.env[GATEWAY_KEY_ENV] || '').trim()
  const baseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })
  const prev = getOfficialUsageCache()

  if (!apiKey) {
    return {
      ok: false,
      message: '请先开通官方通道',
      usage: null,
      settings: getSettingsSnapshot(),
    }
  }

  const listed = await getUsageMe({ apiKey, baseUrl })
  if (!listed.ok) {
    if (prev) {
      setOfficialUsageCache({ ...prev, error: listed.message, fetchedAt: Date.now() })
    } else {
      setOfficialUsageCache(
        buildUsageSnapshot({
          balanceLi: 0,
          liPerYuan: 1000,
          todayPromptTokens: null,
          todayCompletionTokens: null,
          error: listed.message,
        }),
      )
    }
    return {
      ok: false,
      message: listed.message,
      usage: getOfficialUsageCache(),
      settings: getSettingsSnapshot(),
    }
  }

  const snap = buildUsageSnapshot({
    balanceLi: listed.balanceLi,
    liPerYuan: listed.liPerYuan,
    keyPrefix: listed.keyPrefix,
    todayPromptTokens: listed.todayPromptTokens,
    todayCompletionTokens: listed.todayCompletionTokens,
  })
  setOfficialUsageCache(snap)

  return {
    ok: true,
    message: `余额 ¥${snap.balanceDisplay}`,
    usage: snap,
    settings: getSettingsSnapshot(),
  }
}

/**
 * UC JWT 换票 → 系统浏览器打开网关充值页（US-G3-04）。
 */
export async function openOfficialRecharge(): Promise<OpenOfficialRechargeResult> {
  return openOfficialBillingPage({
    buildUrl: buildRechargePageUrl,
    loginMessage: '请先登录后再充值',
    invalidUrlMessage: '无法打开充值页：地址无效',
    protocolMessage: '无法打开充值页：仅支持 http(s)',
    originMismatchMessage: '无法打开充值页：网关地址异常',
    browserMessage: '无法打开浏览器，请检查系统默认浏览器设置',
    successMessage: '已在浏览器打开充值页',
    logTag: 'recharge',
    markRechargeFocus: true,
  })
}

/**
 * UC JWT 换票 → 系统浏览器打开网关用户面板（US-G4-07）。
 */
export async function openOfficialPortal(): Promise<OpenOfficialPortalResult> {
  return openOfficialBillingPage({
    buildUrl: buildPortalPageUrl,
    loginMessage: '请先登录后再查看账户详情',
    invalidUrlMessage: '无法打开账户面板：地址无效',
    protocolMessage: '无法打开账户面板：仅支持 http(s)',
    originMismatchMessage: '无法打开账户面板：网关地址异常',
    browserMessage: '无法打开浏览器，请检查系统默认浏览器设置',
    successMessage: '已在浏览器打开账户面板',
    logTag: 'portal',
    markRechargeFocus: false,
  })
}

async function openOfficialBillingPage(opts: {
  buildUrl: (
    ticket: string,
    env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  ) => string
  loginMessage: string
  invalidUrlMessage: string
  protocolMessage: string
  originMismatchMessage: string
  browserMessage: string
  successMessage: string
  logTag: string
  markRechargeFocus: boolean
}): Promise<OpenOfficialRechargeResult> {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const mergedEnv = { ...process.env, ...env }
  const baseUrl = getTokenGatewayBaseUrl(mergedEnv)
  const expectedOrigin = getTokenGatewayOrigin(mergedEnv)

  let bundle = await ensureFreshTokens()
  if (!bundle?.accessToken) {
    return { ok: false, needLogin: true, message: opts.loginMessage }
  }

  let ticketRes = await createRechargeTicket({
    accessToken: bundle.accessToken,
    baseUrl,
  })

  if (!ticketRes.ok && ticketRes.code === 'need_login') {
    bundle = await ensureFreshTokens({ force: true })
    if (!bundle?.accessToken) {
      return { ok: false, needLogin: true, message: opts.loginMessage }
    }
    ticketRes = await createRechargeTicket({
      accessToken: bundle.accessToken,
      baseUrl,
    })
  }

  if (!ticketRes.ok) {
    return {
      ok: false,
      needLogin: ticketRes.code === 'need_login',
      message: ticketRes.message,
    }
  }

  const pageUrl = opts.buildUrl(ticketRes.ticket, mergedEnv)
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return { ok: false, message: opts.invalidUrlMessage }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: opts.protocolMessage }
  }
  const originNow = `${parsed.protocol}//${parsed.host}`
  if (originNow !== expectedOrigin) {
    console.warn(`[ftcs:gateway] ${opts.logTag} origin mismatch`, {
      expected: expectedOrigin,
      actual: originNow,
    })
    return { ok: false, message: opts.originMismatchMessage }
  }

  try {
    await shell.openExternal(parsed.toString())
  } catch (err) {
    console.warn(
      `[ftcs:gateway] openExternal failed (${opts.logTag})`,
      err instanceof Error ? err.message : String(err),
    )
    return {
      ok: false,
      message: opts.browserMessage,
    }
  }

  if (opts.markRechargeFocus) {
    lastRechargeOpenedAt = Date.now()
  }
  return { ok: true, message: opts.successMessage }
}

/**
 * 主窗口 focus：若近期打开过充值页，则自动刷一次余额（防抖）。
 */
export async function maybeRefreshUsageAfterRechargeFocus(): Promise<void> {
  const now = Date.now()
  if (!lastRechargeOpenedAt) return
  if (now - lastRechargeOpenedAt > RECHARGE_FOCUS_REFRESH_WINDOW_MS) return
  if (now - lastFocusUsageRefreshAt < RECHARGE_FOCUS_REFRESH_MIN_GAP_MS) return
  lastFocusUsageRefreshAt = now
  try {
    await refreshOfficialUsage()
  } catch (err) {
    console.warn(
      '[ftcs:gateway] focus usage refresh failed',
      err instanceof Error ? err.message : String(err),
    )
  }
}

export function describeGatewayKeyMask(env?: Record<string, string>): string {
  const key = (
    env?.[GATEWAY_KEY_ENV] ||
    process.env[GATEWAY_KEY_ENV] ||
    ''
  ).trim()
  return key ? maskSecret(key) : ''
}
