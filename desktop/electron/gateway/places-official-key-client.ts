/**
 * 桌面调用 token-gateway 的三个官方 Places 接口。
 * 路径接在 FTCS_TOKEN_GATEWAY_BASE_URL（已含 /v1）之后。
 * 联调默认 https://token.ai-utills.com/v1 。
 *
 * 不缓存状态，不把 apiKey 写进日志。
 */
import { getTokenGatewayBaseUrl } from './gateway-config'
import { applyErrorMessage } from '../../src/domain/places-official'

export const PLACES_OFFICIAL_APPLY_PATH = '/places/official-key/applications'
export const PLACES_OFFICIAL_STATUS_PATH = '/places/official-key'
export const PLACES_OFFICIAL_CURRENT_PATH = '/places/official-key/current'

const LOG = '[ftcs:places-official]'

export interface PlacesStatusBody {
  status: string
  reasonCode: string | null
  reasonMessage: string | null
  appliedAt: string | null
  updatedAt: string | null
  expectedReadyNote: string | null
  reapplyAllowed: boolean | null
}

export interface PlacesOfficialKeyMaterial {
  apiKey: string
  expiresAt: string | null
  keyVersion: string | null
}

export type PlacesCallFailure = {
  ok: false
  httpStatus?: number
  code: string
  message: string
  status?: string | null
  reasonCode?: string | null
}

export type PlacesStatusResult =
  | { ok: true; httpStatus: number; body: PlacesStatusBody }
  | PlacesCallFailure

export type PlacesCurrentResult =
  | { ok: true; httpStatus: number; material: PlacesOfficialKeyMaterial }
  | PlacesCallFailure

export interface PlacesOfficialKeyClient {
  apply(accessToken: string): Promise<PlacesStatusResult>
  getStatus(accessToken: string): Promise<PlacesStatusResult>
  getCurrent(accessToken: string): Promise<PlacesCurrentResult>
}

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean
  status: number
  statusText?: string
  text: () => Promise<string>
}>

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function parsePlacesStatusBody(raw: unknown): PlacesStatusBody | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const status = nullableString(record.status)
  if (!status) return null
  return {
    status,
    reasonCode: nullableString(record.reasonCode),
    reasonMessage: nullableString(record.reasonMessage),
    appliedAt: nullableString(record.appliedAt),
    updatedAt: nullableString(record.updatedAt),
    expectedReadyNote: nullableString(record.expectedReadyNote),
    reapplyAllowed:
      typeof record.reapplyAllowed === 'boolean' ? record.reapplyAllowed : null,
  }
}

function readErrorCode(raw: unknown, httpStatus: number): {
  code: string
  message: string
  status?: string | null
  reasonCode?: string | null
} {
  const record =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const code =
    nullableString(record.code) ||
    (httpStatus === 401
      ? 'need_login'
      : httpStatus === 409
        ? 'conflict'
        : httpStatus === 429
          ? 'rate_limited'
          : httpStatus === 403
            ? 'forbidden'
            : httpStatus === 503
              ? 'unavailable'
              : 'unknown')
  const message =
    nullableString(record.message) || applyErrorMessage(code, null)
  const status = nullableString(record.status)
  const reasonCode = nullableString(record.reasonCode)
  return {
    code,
    message,
    ...(status ? { status } : {}),
    ...(reasonCode ? { reasonCode } : {}),
  }
}

function logCall(label: string, extra: Record<string, unknown>): void {
  const safe = { ...extra }
  if ('apiKey' in safe) delete safe.apiKey
  console.info(LOG, label, safe)
}

export function createPlacesOfficialKeyClient(options?: {
  fetchImpl?: FetchLike
  baseUrl?: string
  timeoutMs?: number
}): PlacesOfficialKeyClient {
  const fetchImpl = options?.fetchImpl || (globalThis.fetch as unknown as FetchLike)
  const timeoutMs = options?.timeoutMs ?? 20_000

  async function request(
    method: 'GET' | 'POST',
    path: string,
    accessToken: string,
  ): Promise<{ httpStatus: number; json: unknown } | PlacesCallFailure> {
    const base = options?.baseUrl || getTokenGatewayBaseUrl()
    const url = joinUrl(base, path)
    logCall('request', { method, url })
    try {
      const res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await res.text()
      let json: unknown = null
      if (text.trim()) {
        try {
          json = JSON.parse(text) as unknown
        } catch {
          json = { message: text.slice(0, 200) }
        }
      }
      if (!res.ok) {
        const err = readErrorCode(json, res.status)
        logCall('http error', { method, url, httpStatus: res.status, code: err.code })
        return { ok: false, httpStatus: res.status, ...err }
      }
      return { httpStatus: res.status, json }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logCall('network', { method, url, message })
      return {
        ok: false,
        code: 'network',
        message: applyErrorMessage('network'),
      }
    }
  }

  return {
    async apply(accessToken: string): Promise<PlacesStatusResult> {
      const res = await request('POST', PLACES_OFFICIAL_APPLY_PATH, accessToken)
      if ('ok' in res) return res
      const body = parsePlacesStatusBody(res.json)
      if (!body) {
        return {
          ok: false,
          httpStatus: res.httpStatus,
          code: 'unknown',
          message: '官方服务返回了无法识别的申请结果',
        }
      }
      logCall('apply ok', { status: body.status })
      return { ok: true, httpStatus: res.httpStatus, body }
    },

    async getStatus(accessToken: string): Promise<PlacesStatusResult> {
      const res = await request('GET', PLACES_OFFICIAL_STATUS_PATH, accessToken)
      if ('ok' in res) return res
      const body = parsePlacesStatusBody(res.json)
      if (!body) {
        return {
          ok: false,
          httpStatus: res.httpStatus,
          code: 'unknown',
          message: '官方服务返回了无法识别的状态',
        }
      }
      logCall('status ok', { status: body.status })
      return { ok: true, httpStatus: res.httpStatus, body }
    },

    async getCurrent(accessToken: string): Promise<PlacesCurrentResult> {
      const res = await request('GET', PLACES_OFFICIAL_CURRENT_PATH, accessToken)
      if ('ok' in res) return res
      const record =
        res.json && typeof res.json === 'object'
          ? (res.json as Record<string, unknown>)
          : {}
      const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : ''
      const statusBody = parsePlacesStatusBody(res.json)
      if (!apiKey) {
        const code = statusBody?.status || 'not_active'
        logCall('current without key', { status: statusBody?.status || null })
        return {
          ok: false,
          httpStatus: res.httpStatus,
          code,
          message: applyErrorMessage(code, statusBody?.reasonMessage),
          status: statusBody?.status ?? null,
          reasonCode: statusBody?.reasonCode ?? null,
        }
      }
      logCall('current ok', {
        keyVersion: nullableString(record.keyVersion),
        apiKeyLength: apiKey.length,
      })
      return {
        ok: true,
        httpStatus: res.httpStatus,
        material: {
          apiKey,
          expiresAt: nullableString(record.expiresAt),
          keyVersion: nullableString(record.keyVersion),
        },
      }
    },
  }
}
