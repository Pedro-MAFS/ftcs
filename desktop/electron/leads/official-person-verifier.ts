import { randomUUID } from 'node:crypto'
import { getTokenGatewayBaseUrl } from '../gateway/gateway-config'

/** 抽屉官方验邮与 US-HC-02 同一条路径。90 秒，不轮询，不重试。 */
export const OFFICIAL_DRAWER_VERIFIER_TIMEOUT_MS = 90_000

export const OFFICIAL_DRAWER_VERIFY_PENDING =
  '验证尚未完成，请稍后再次验证。'
export const OFFICIAL_DRAWER_VERIFY_FAILED = '验证暂时失败，请稍后重试。'
export const OFFICIAL_DRAWER_BALANCE =
  '官方通道余额不足。请到设置 → 模型通道查看余额并充值。'
export const OFFICIAL_DRAWER_CREDENTIAL =
  '官方通道凭证不可用。请到设置 → 模型通道登录、开通或检查官方通道。'
export const OFFICIAL_DRAWER_UNAVAILABLE = '补全联系人暂时不可用，请稍后再试。'
export const OFFICIAL_DRAWER_RATE_LIMIT = '请求过于频繁，请稍后重试。'
export const OFFICIAL_DRAWER_CLAIMED =
  '该邮箱持有人已要求停止处理其数据，本次不再处理该邮箱。'

const CREDENTIAL_REASONS = new Set([
  'missing_authorization',
  'invalid_authorization',
  'invalid_api_key',
  'key_disabled',
  'account_disabled',
])

export function officialDrawerVerifierUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/hunter/email-verifier`
}

function readErrorFields(body: unknown): {
  code?: string
  detail?: string
  reason?: string
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const record = body as Record<string, unknown>
  let code: string | undefined
  let detail: string | undefined
  const error = record.error
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const errorRecord = error as Record<string, unknown>
    if (typeof errorRecord.code === 'string' && errorRecord.code.trim()) {
      code = errorRecord.code.trim()
    }
    if (typeof errorRecord.detail === 'string') detail = errorRecord.detail
  }
  if (!detail && typeof record.detail === 'string') detail = record.detail
  const reason =
    typeof record.reason === 'string' && record.reason.trim()
      ? record.reason.trim()
      : undefined
  return { code, detail, reason }
}

/** 先认 error.code，再认 reason。504 与 502 的句子不同。 */
export function mapOfficialDrawerVerifierFailure(status: number, body: unknown): string {
  const fields = readErrorFields(body)
  if (fields.code) {
    if (fields.code === 'hunter_verification_pending') return OFFICIAL_DRAWER_VERIFY_PENDING
    if (fields.code === 'hunter_upstream_error') return OFFICIAL_DRAWER_VERIFY_FAILED
    if (fields.code === 'hunter_claimed_email') return OFFICIAL_DRAWER_CLAIMED
    if (fields.code === 'hunter_rate_limited') return OFFICIAL_DRAWER_RATE_LIMIT
    if (
      fields.code === 'hunter_upstream_unavailable' ||
      fields.code === 'hunter_pricing_unavailable'
    ) {
      return OFFICIAL_DRAWER_UNAVAILABLE
    }
    return OFFICIAL_DRAWER_VERIFY_FAILED
  }
  if (fields.reason) {
    if (CREDENTIAL_REASONS.has(fields.reason)) return OFFICIAL_DRAWER_CREDENTIAL
    if (fields.reason === 'insufficient_quota') return OFFICIAL_DRAWER_BALANCE
    if (fields.reason === 'missing_gateway_key_pepper') return OFFICIAL_DRAWER_UNAVAILABLE
  }
  if (status === 504) return OFFICIAL_DRAWER_VERIFY_PENDING
  return OFFICIAL_DRAWER_VERIFY_FAILED
}

export interface OfficialDrawerVerifySuccess {
  ok: true
  status: string | null
  score: number | null
}

export interface OfficialDrawerVerifyFailure {
  ok: false
  message: string
}

export async function verifyEmailViaOfficialGateway(input: {
  email: string
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<OfficialDrawerVerifySuccess | OfficialDrawerVerifyFailure> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    return { ok: false, message: OFFICIAL_DRAWER_CREDENTIAL }
  }
  const base = input.baseUrl?.trim()
    ? input.baseUrl.trim().replace(/\/+$/, '')
    : getTokenGatewayBaseUrl()
  const url = officialDrawerVerifierUrl(base)
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? OFFICIAL_DRAWER_VERIFIER_TIMEOUT_MS
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Request-Id': randomUUID(),
      },
      body: JSON.stringify({ email: input.email }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return { ok: false, message: OFFICIAL_DRAWER_VERIFY_FAILED }
  }

  let body: unknown
  let parsed = false
  try {
    body = await response.json()
    parsed = true
  } catch {
    parsed = false
  }
  if (!response.ok) {
    return {
      ok: false,
      message: mapOfficialDrawerVerifierFailure(response.status, parsed ? body : undefined),
    }
  }
  const data =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { data?: unknown }).data
      : undefined
  const record =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined
  const status = typeof record?.status === 'string' ? record.status.trim() : ''
  if (!status) {
    return { ok: false, message: OFFICIAL_DRAWER_VERIFY_FAILED }
  }
  const score = record?.score
  return {
    ok: true,
    status,
    score: typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null,
  }
}
