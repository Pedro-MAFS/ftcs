import {
  getMessageAckUrl,
  getMessagePullUrl,
  getOAuthConfig,
} from './oauth-config'
import { ensureFreshTokens } from './oauth-service'
import {
  DEFAULT_INBOX_POLL_MS,
  type BaseResponse,
  type InboxAckResult,
  type InboxAnswer,
  type InboxBlock,
  type InboxConfig,
  type InboxMessage,
  type InboxPullResult,
} from './inbox-types'

const LOG = '[ftcs:inbox]'

function log(...args: unknown[]): void {
  console.log(LOG, ...args)
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG, ...args)
}

export function getInboxPollIntervalMs(): number {
  const raw = process.env.FTCS_INBOX_POLL_MS?.trim()
  if (!raw) return DEFAULT_INBOX_POLL_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INBOX_POLL_MS
  return Math.floor(n)
}

export function getInboxConfig(): InboxConfig {
  const pollIntervalMs = getInboxPollIntervalMs()
  const config = getOAuthConfig()
  log('getInboxConfig', {
    pollIntervalMs,
    issuer: config.issuer,
    clientId: config.clientId,
    pullUrl: getMessagePullUrl(config),
    ackUrl: getMessageAckUrl(config),
    envPoll: process.env.FTCS_INBOX_POLL_MS ?? '(unset)',
    envUserOrigin: process.env.FTCS_USER_ORIGIN ?? '(unset)',
  })
  return { pollIntervalMs }
}

export async function pullMessages(limit = 20): Promise<InboxPullResult> {
  const url = getMessagePullUrl()
  const clientId = getOAuthConfig().clientId
  log('pull start', { url, clientId, limit })
  try {
    const result = await withBearer(async (token, cid) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ clientId: cid, limit }),
      })
      const text = await res.text()
      log('pull http', {
        status: res.status,
        bodyPreview: text.slice(0, 500),
      })
      if (res.status === 401) {
        return { httpStatus: 401 as const }
      }
      let json: BaseResponse<{ items?: unknown }>
      try {
        json = JSON.parse(text) as BaseResponse<{ items?: unknown }>
      } catch {
        return {
          httpStatus: res.status,
          result: {
            ok: false,
            message: `拉取响应非 JSON（HTTP ${res.status}）`,
          },
        }
      }
      const biz = readBizResult(json)
      if (!biz.ok) {
        logWarn('pull business error', biz)
        return {
          httpStatus: res.status,
          result: {
            ok: false,
            message: biz.message || '拉取失败',
          },
        }
      }
      const items = normalizeItems(json.data?.items)
      log('pull ok', {
        rawItemCount: Array.isArray(json.data?.items)
          ? json.data!.items!.length
          : typeof json.data?.items,
        normalizedCount: items.length,
        messageIds: items.map((m) => m.messageId),
      })
      return {
        httpStatus: res.status,
        result: { ok: true, message: 'ok', items },
      }
    })
    log('pull result', {
      ok: result.ok,
      needLogin: result.needLogin,
      message: result.message,
      count: result.items?.length ?? 0,
    })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logWarn('pull exception', message)
    return { ok: false, message }
  }
}

export async function ackMessage(
  messageId: string,
  answers: InboxAnswer[] = [],
): Promise<InboxAckResult> {
  const id = String(messageId || '').trim()
  if (!id) {
    return { ok: false, message: 'messageId 不能为空' }
  }

  const url = getMessageAckUrl()
  log('ack start', { url, messageId: id, answersCount: answers.length })
  try {
    const result = await withBearer(async (token, clientId) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          clientId,
          messageId: id,
          answers: answers ?? [],
        }),
      })
      const text = await res.text()
      log('ack http', { status: res.status, bodyPreview: text.slice(0, 300) })
      if (res.status === 401) {
        return { httpStatus: 401 as const }
      }
      let json: BaseResponse<null>
      try {
        json = JSON.parse(text) as BaseResponse<null>
      } catch {
        return {
          httpStatus: res.status,
          result: {
            ok: false,
            message: `确认响应非 JSON（HTTP ${res.status}）`,
          },
        }
      }
      const biz = readBizResult(json)
      if (!biz.ok) {
        return {
          httpStatus: res.status,
          result: {
            ok: false,
            message: biz.message || '确认失败',
          },
        }
      }
      return {
        httpStatus: res.status,
        result: { ok: true, message: '已确认' },
      }
    })
    log('ack result', result)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logWarn('ack exception', message)
    return { ok: false, message }
  }
}

type BearerAttempt<T> =
  | { httpStatus: 401 }
  | { httpStatus: number; result: T }

async function withBearer<T extends { ok: boolean; message: string; needLogin?: boolean }>(
  run: (token: string, clientId: string) => Promise<BearerAttempt<T>>,
): Promise<T> {
  const clientId = getOAuthConfig().clientId
  let bundle = await ensureFreshTokens()
  if (!bundle?.accessToken) {
    logWarn('no access token, needLogin')
    return {
      ok: false,
      needLogin: true,
      message: '请先登录后再查看站内信',
    } as T
  }
  log('token ready', {
    clientId,
    expiresAt: bundle.expiresAt
      ? new Date(bundle.expiresAt).toISOString()
      : null,
    tokenLen: bundle.accessToken.length,
  })

  let attempt = await run(bundle.accessToken, clientId)
  if (attempt.httpStatus === 401) {
    logWarn('got 401, force refresh and retry')
    bundle = await ensureFreshTokens({ force: true })
    if (!bundle?.accessToken) {
      return {
        ok: false,
        needLogin: true,
        message: '登录已失效，请重新登录',
      } as T
    }
    attempt = await run(bundle.accessToken, clientId)
    if (attempt.httpStatus === 401) {
      logWarn('still 401 after refresh')
      return {
        ok: false,
        needLogin: true,
        message: '登录已失效，请重新登录',
      } as T
    }
  }

  if ('result' in attempt) return attempt.result
  return {
    ok: false,
    message: '站内信请求失败',
  } as T
}

/** errorNo === 0 为成功 */
function readBizResult(json: BaseResponse<unknown>): {
  ok: boolean
  message: string
} {
  const errorNo = json.errorNo
  const message = json.errorInfo ? String(json.errorInfo) : ''
  if (typeof errorNo !== 'number') {
    return { ok: false, message: message || '响应缺少 errorNo' }
  }
  if (errorNo !== 0) {
    return {
      ok: false,
      message: message || `业务失败（errorNo=${errorNo}）`,
    }
  }
  return { ok: true, message: message || 'ok' }
}

function normalizeTime(raw: unknown): string {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString()
  }
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) return new Date(n).toISOString()
  }
  return s
}

function normalizeItems(raw: unknown): InboxMessage[] {
  if (!Array.isArray(raw)) {
    logWarn('normalizeItems: data.items is not array', typeof raw)
    return []
  }
  const out: InboxMessage[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const messageId = String(o.messageId ?? '').trim()
    if (!messageId) {
      logWarn('normalizeItems: skip row without messageId', o)
      continue
    }
    out.push({
      messageId,
      createTime: normalizeTime(o.createTime),
      expireAt: normalizeTime(o.expireAt),
      blocks: normalizeBlocks(o.blocks),
    })
  }
  return out
}

function normalizeBlocks(raw: unknown): InboxBlock[] {
  if (!Array.isArray(raw)) return []
  const out: InboxBlock[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const type = String(o.type ?? '').toUpperCase()
    if (type === 'TEXT') {
      out.push({ type: 'TEXT', body: String(o.body ?? '') })
      continue
    }
    const id = String(o.id ?? '').trim()
    const title = String(o.title ?? '')
    if (!id) continue
    if (type === 'SINGLE') {
      out.push({
        type: 'SINGLE',
        id,
        title,
        options: normalizeOptions(o.options),
      })
      continue
    }
    if (type === 'MULTI') {
      out.push({
        type: 'MULTI',
        id,
        title,
        options: normalizeOptions(o.options),
      })
      continue
    }
    if (type === 'TEXT_REPLY') {
      const maxRaw = o.maxLength
      const maxLength =
        typeof maxRaw === 'number' && Number.isFinite(maxRaw)
          ? maxRaw
          : undefined
      out.push({
        type: 'TEXT_REPLY',
        id,
        title,
        ...(maxLength != null ? { maxLength } : {}),
      })
    }
  }
  return out
}

function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? ''))
}
