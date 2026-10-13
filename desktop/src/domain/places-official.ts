/**
 * 官方 Places Key 的纯规则（US-PK-C-01～C-04）。
 * 不发网络、不写磁盘、不持有 apiKey。
 */

export const PLACES_OFFICIAL_STATUSES = [
  'none',
  'pending',
  'active',
  'provision_failed',
  'arrears',
  'revoked',
] as const

export type PlacesOfficialStatus = (typeof PLACES_OFFICIAL_STATUSES)[number]

export type PlacesKeySource = 'official' | 'custom'

export type PlacesKeyOffer =
  | 'switch-to-byok'
  | 'switch-to-official'
  | 'open-settings'
  | 'relogin'

export const PLACES_KEY_SOURCE_ENV = 'FTCS_PLACES_KEY_SOURCE'

export const OFFICIAL_PLACES_DETAIL = '官方下发 Key（本机直连 Google）'
export const BYOK_PLACES_DETAIL = '自备 Google Places API Key（本机直连）'
export const PLACES_DISCOVERY_SNIPPET = '发现：Places 候选，经官网核实'
export const ARREARS_MESSAGE = '已欠费，请充值'
export const REVOKED_MESSAGE = '请联系客服'
export const NO_PLACES_KEY_MESSAGE =
  '请在设置 → 探索申请官方 Places Key（仅 R3 需要）。'
export const CUSTOM_PLACES_MISSING_MESSAGE =
  '请在设置 → 探索填写自备 Places Key（仅 R3 需要）。'
export const NETWORK_KEY_MESSAGE =
  '暂时联系不上官方服务，未能获取 Places Key。请稍后重试。'
export const NEED_LOGIN_KEY_MESSAGE = '请先登录后再使用官方 Places Key。'
export const CREDENTIAL_REVOKED_MESSAGE =
  '登录凭证已吊销，不能获取官方 Places Key。请重新登录。'
export const OFFICIAL_KEY_REVOKED_MESSAGE =
  '官方 Places Key 已吊销，不能再用来查询 Places。'
export const RATE_LIMIT_MESSAGE = '获取官方 Places Key 过于频繁，请稍后再试。'
export const PENDING_PREFLIGHT_DETAIL =
  '官方 Places Key 申请中，预计在受理后的下一自然日内开通。可在设置 → 探索查看。'
export const PROVISION_FAILED_PREFLIGHT_DETAIL =
  '官方 Places Key 开通失败。可在设置 → 探索再次申请。'
export const APPLY_NEED_LOGIN_MESSAGE = '请先登录'
export const NETWORK_STATUS_MESSAGE = '暂时联系不上官方服务。'
export const UNKNOWN_STATUS_MESSAGE = '状态无法识别，请稍后刷新'
export const OFFICIAL_PLACES_ACTIVE_NOTE =
  '官方 Places Key 已开通。每次使用时重新获取，不保存在这台电脑上。'
export const PENDING_FALLBACK_NOTE = '预计在受理后的下一自然日内开通。'
export const PROVISION_FAILED_FALLBACK_NOTE = '开通未成功。可以再次申请。'

const PLACES_TOOL_NAMES = new Set(['places_text_search', 'place_details'])

/** 模型通道决定 Places 来源。自定义通道用自备 Key，其余（含官方）用官方 Key。 */
export function placesSourceForChannel(
  channelMode: string | null | undefined,
): PlacesKeySource {
  return channelMode === 'custom' ? 'custom' : 'official'
}

/** 只有自定义通道才把自备 Key 写入 .env。官方通道忽略这次输入。 */
export function placesByokPersistedForChannel(
  channelMode: string | null | undefined,
): boolean {
  return placesSourceForChannel(channelMode) === 'custom'
}

export function parsePlacesKeySource(
  raw: string | null | undefined,
): '' | PlacesKeySource {
  if (raw === 'official') return 'official'
  if (raw === 'custom' || raw === 'byok') return 'custom'
  return ''
}

export function isKnownPlacesOfficialStatus(
  status: string | null | undefined,
): status is PlacesOfficialStatus {
  return (PLACES_OFFICIAL_STATUSES as readonly string[]).includes(status || '')
}

export function canApplyPlacesOfficialKey(input: {
  loggedIn: boolean
  status: string | null
}): boolean {
  return (
    input.loggedIn &&
    (input.status === 'none' ||
      input.status === 'provision_failed' ||
      input.status === null)
  )
}

export function placesOfficialStatusLabel(status: string | null): string {
  switch (status) {
    case 'none':
      return '未申请'
    case 'pending':
      return '申请中'
    case 'active':
      return '已开通'
    case 'provision_failed':
      return '开通失败'
    case 'arrears':
      return '欠费'
    case 'revoked':
      return '已吊销'
    default:
      return UNKNOWN_STATUS_MESSAGE
  }
}

export function placesOfficialSupplement(input: {
  status: string | null
  reasonMessage?: string | null
  expectedReadyNote?: string | null
}): string {
  const reason = input.reasonMessage?.trim() || ''
  const note = input.expectedReadyNote?.trim() || ''
  switch (input.status) {
    case 'none':
      return ''
    case 'pending':
      return note || PENDING_FALLBACK_NOTE
    case 'active':
      return OFFICIAL_PLACES_ACTIVE_NOTE
    case 'provision_failed':
      return reason || PROVISION_FAILED_FALLBACK_NOTE
    case 'arrears':
      return ARREARS_MESSAGE
    case 'revoked':
      return REVOKED_MESSAGE
    default:
      return reason || UNKNOWN_STATUS_MESSAGE
  }
}

export function applyErrorMessage(
  code: string | undefined,
  serverMessage?: string | null,
): string {
  switch (code) {
    case 'need_login':
      return APPLY_NEED_LOGIN_MESSAGE
    case 'credential_revoked':
      return '登录凭证已吊销，请重新登录'
    case 'apply_while_pending':
      return '申请处理中，请等待开通'
    case 'apply_while_active':
      return '已开通，无需再次申请'
    case 'apply_while_arrears':
      return ARREARS_MESSAGE
    case 'apply_while_revoked':
      return REVOKED_MESSAGE
    case 'rate_limited':
      return '请求过于频繁，请稍后重试'
    case 'forbidden':
      return '账号不可用'
    case 'unavailable':
      return '官方服务暂不可用'
    case 'network':
      return NETWORK_STATUS_MESSAGE
    default:
      return serverMessage?.trim() || '官方服务请求失败'
  }
}

export interface PlacesEffectiveKey {
  ok: boolean
  source: PlacesKeySource | 'none'
  detail: string
  offer: PlacesKeyOffer | null
}

export function detailForKnownOfficialStatus(
  status: string | null | undefined,
): { detail: string; offer: PlacesKeyOffer | null } {
  if (status === 'arrears') {
    return { detail: ARREARS_MESSAGE, offer: null }
  }
  if (status === 'revoked') {
    return { detail: REVOKED_MESSAGE, offer: null }
  }
  if (status === 'pending') {
    return { detail: PENDING_PREFLIGHT_DETAIL, offer: 'open-settings' }
  }
  if (status === 'provision_failed') {
    return { detail: PROVISION_FAILED_PREFLIGHT_DETAIL, offer: 'open-settings' }
  }
  return { detail: NO_PLACES_KEY_MESSAGE, offer: 'open-settings' }
}

/**
 * Places 来源跟模型通道走，不单独选择。
 * 官方通道只用官方 Key；自定义通道只用自备 Key。
 */
export function resolvePlacesEffectiveKey(input: {
  channelMode?: string | null
  byokSet: boolean
  officialStatus?: string | null
}): PlacesEffectiveKey {
  if (placesSourceForChannel(input.channelMode) === 'custom') {
    if (input.byokSet) {
      return { ok: true, source: 'custom', detail: BYOK_PLACES_DETAIL, offer: null }
    }
    return {
      ok: false,
      source: 'none',
      detail: CUSTOM_PLACES_MISSING_MESSAGE,
      offer: 'open-settings',
    }
  }
  if (input.officialStatus === 'active') {
    return {
      ok: true,
      source: 'official',
      detail: OFFICIAL_PLACES_DETAIL,
      offer: null,
    }
  }
  const failure = detailForKnownOfficialStatus(input.officialStatus)
  return { ok: false, source: 'none', detail: failure.detail, offer: failure.offer }
}

export type PlacesRunPlan =
  | { action: 'use-byok' }
  | { action: 'fetch-official' }
  | { action: 'fail'; detail: string; offer: PlacesKeyOffer | null }

/** 开跑不查状态。官方通道取官方 Key；自定义通道只用已填写的自备 Key。 */
export function planPlacesRun(input: {
  channelMode?: string | null
  byokSet: boolean
}): PlacesRunPlan {
  if (placesSourceForChannel(input.channelMode) === 'custom') {
    if (input.byokSet) return { action: 'use-byok' }
    return {
      action: 'fail',
      detail: CUSTOM_PLACES_MISSING_MESSAGE,
      offer: 'open-settings',
    }
  }
  return { action: 'fetch-official' }
}

export function currentPlacesUsageLabel(input: {
  channelMode?: string | null
  byokSet: boolean
}): string {
  if (placesSourceForChannel(input.channelMode) === 'official') return '官方下发 Key'
  if (input.byokSet) return '自备 Places Key'
  return ''
}

export interface OfficialKeyFailureDetail {
  detail: string
  offer: PlacesKeyOffer | null
  needLogin: boolean
}

export function detailForOfficialKeyFailure(input: {
  code: string
  status?: string | null
  byokSet: boolean
  serverMessage?: string | null
  reasonCode?: string | null
}): OfficialKeyFailureDetail {
  const status = input.status ?? null
  const code = input.code
  if (code === 'need_login') {
    return { detail: NEED_LOGIN_KEY_MESSAGE, offer: 'relogin', needLogin: true }
  }
  if (code === 'credential_revoked') {
    return {
      detail: CREDENTIAL_REVOKED_MESSAGE,
      offer: 'relogin',
      needLogin: true,
    }
  }
  if (code === 'network') {
    return { detail: NETWORK_KEY_MESSAGE, offer: null, needLogin: false }
  }
  if (code === 'rate_limited') {
    return { detail: RATE_LIMIT_MESSAGE, offer: null, needLogin: false }
  }
  if (code === 'arrears' || status === 'arrears') {
    const mapped = detailForKnownOfficialStatus('arrears')
    return { ...mapped, needLogin: false }
  }
  if (code === 'revoked' || status === 'revoked') {
    const mapped = detailForKnownOfficialStatus('revoked')
    return { ...mapped, needLogin: false }
  }
  const reason = (input.reasonCode || '').toLowerCase()
  if (
    code === 'key_revoked' ||
    reason === 'revoked' ||
    reason === 'abuse' ||
    reason.includes('revok')
  ) {
    return {
      detail: OFFICIAL_KEY_REVOKED_MESSAGE,
      offer: null,
      needLogin: false,
    }
  }
  if (code === 'not_active' || code === 'forbidden') {
    const mapped = detailForKnownOfficialStatus(status)
    return { ...mapped, needLogin: false }
  }
  return {
    detail: input.serverMessage?.trim() || '未能获取官方 Places Key。',
    offer: null,
    needLogin: false,
  }
}

/**
 * 运行中 Google 拒绝后的用户文案。
 * 锁定决定：只有欠费换成「已欠费，请充值」，其余原样使用 Google 错误。
 */
export function messageAfterGoogleRejectedKey(input: {
  googleMessage: string
  status: string | null
  statusQueryOk: boolean
}): string {
  if (input.statusQueryOk && input.status === 'arrears') return ARREARS_MESSAGE
  return input.googleMessage
}

function collectText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function parseJsonRecords(text: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = []
  const trimmed = text.trim()
  if (!trimmed) return found
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      found.push(parsed as Record<string, unknown>)
    }
  } catch {
    // 工具输出可能夹着别的文字
  }
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (match && found.length === 0) {
    try {
      const parsed = JSON.parse(match[0]) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        found.push(parsed as Record<string, unknown>)
      }
    } catch {
      // ignore
    }
  }
  return found
}

function httpStatusOf(record: Record<string, unknown>): number | null {
  const raw = record.http_status ?? record.httpStatus ?? record.status
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) ? n : null
}

function looksLikeQuota(text: string): boolean {
  return /RESOURCE_EXHAUSTED/i.test(text) || /\bquota\b/i.test(text)
}

function rejectionMessage(record: Record<string, unknown>): string | null {
  const code = String(record.code || '')
  const httpStatus = httpStatusOf(record)
  const message = String(record.message || '').trim()
  const blob = `${code}\n${message}`
  const placesHttp = code === 'PLACES_HTTP_ERROR'
  const rejectedStatus =
    httpStatus === 401 || httpStatus === 403 || httpStatus === 429
  const quota = looksLikeQuota(blob)
  if (!rejectedStatus && !quota) return null
  if (!placesHttp && !rejectedStatus && !quota) return null
  if (message) return message
  if (httpStatus) return `Google Places HTTP ${httpStatus}`
  return null
}

export function googleRejectionFromText(text: string): string | null {
  if (!text.trim()) return null
  for (const record of parseJsonRecords(text)) {
    const nested = record.error === true || record.code || record.http_status
    if (!nested && !record.message) continue
    const hit = rejectionMessage(record)
    if (hit) return hit
  }
  if (/PLACES_HTTP_ERROR/.test(text) && (/"http_status"\s*:\s*(401|403|429)/.test(text) || looksLikeQuota(text))) {
    const message = text.match(/"message"\s*:\s*"([^"]+)"/)
    return message?.[1] || text.trim().slice(0, 500)
  }
  return null
}

export function googleRejectionFromToolPart(part: {
  tool?: string
  state?: { status?: string; output?: unknown; error?: unknown }
}): string | null {
  const tool = part.tool || ''
  if (!PLACES_TOOL_NAMES.has(tool)) return null
  const text = `${collectText(part.state?.output)}\n${collectText(part.state?.error)}`
  return googleRejectionFromText(text)
}
