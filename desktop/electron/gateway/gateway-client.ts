import {
  FTCS_GATEWAY_KEY_NAME,
  getTokenGatewayBaseUrl,
} from './gateway-config'

const LOG = '[ftcs:gateway]'

function log(...args: unknown[]): void {
  console.log(LOG, ...args)
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG, ...args)
}

/** 日志用：只露前缀，避免明文 sk / JWT */
function maskSecretForLog(value: string | undefined): string {
  const v = (value || '').trim()
  if (!v) return '(empty)'
  if (v.length <= 12) return `${v.slice(0, 4)}…(len=${v.length})`
  return `${v.slice(0, 8)}…${v.slice(-4)}(len=${v.length})`
}

export type GatewayHttpErrorCode =
  | 'need_login'
  | 'account_disabled'
  | 'invalid_name'
  | 'conflict'
  | 'invalid_api_key'
  | 'key_disabled'
  | 'network'
  | 'empty_models'
  | 'unknown'

export interface GatewayClientError {
  ok: false
  code: GatewayHttpErrorCode
  message: string
  httpStatus?: number
  reason?: string
}

export interface RotateKeySuccess {
  ok: true
  action: 'created' | 'rotated' | string
  name: string
  apiKey: string
  prefix: string
  balanceLi?: number
}

export interface GatewayModel {
  id: string
  ownedBy?: string
  inputTypes: string[]
  outputTypes: string[]
}

export interface ListModelsSuccess {
  ok: true
  models: GatewayModel[]
}

function parseGatewayModelTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
}

export function parseGatewayModel(entry: {
  id?: string
  owned_by?: string
  input_types?: unknown
  output_types?: unknown
}): GatewayModel | null {
  const id = String(entry.id || '').trim()
  if (!id) return null
  const ownedBy = String(entry.owned_by || '').trim() || undefined
  const inputTypes = parseGatewayModelTypes(entry.input_types)
  const outputTypes = parseGatewayModelTypes(entry.output_types)
  return {
    id,
    ownedBy,
    inputTypes: inputTypes.length > 0 ? inputTypes : ['txt'],
    outputTypes: outputTypes.length > 0 ? outputTypes : ['txt'],
  }
}

export interface UsageMeSuccess {
  ok: true
  balanceLi: number
  liPerYuan: number
  keyPrefix?: string
  keyName?: string
  todayPromptTokens: number | null
  todayCompletionTokens: number | null
}

function mapReasonToCode(
  httpStatus: number,
  reason: string,
  kind: 'rotate' | 'models' | 'usage' | 'recharge_ticket',
): GatewayHttpErrorCode {
  const r = reason.toLowerCase()
  if (
    httpStatus === 401 ||
    r.includes('missing_authentication') ||
    r.includes('anonymous') ||
    r.includes('missing_identity')
  ) {
    return kind === 'rotate' || kind === 'recharge_ticket'
      ? 'need_login'
      : 'invalid_api_key'
  }
  if (r.includes('invalid_api_key') || r.includes('invalid_authorization') || r.includes('missing_authorization')) {
    return 'invalid_api_key'
  }
  if (r.includes('account_disabled')) return 'account_disabled'
  if (r.includes('key_disabled')) return 'key_disabled'
  if (r.includes('invalid_name')) return 'invalid_name'
  if (httpStatus === 409 || r.includes('conflict')) return 'conflict'
  if (httpStatus === 429 || r.includes('rate_limited')) return 'unknown'
  if (httpStatus === 403) return r.includes('key') ? 'key_disabled' : 'account_disabled'
  return 'unknown'
}

function userMessage(code: GatewayHttpErrorCode, fallback: string): string {
  switch (code) {
    case 'need_login':
      return '请先登录后再开通官方通道'
    case 'account_disabled':
      return '账户已禁用，请联系运营'
    case 'invalid_name':
      return '网关 Key 名称无效'
    case 'conflict':
      return '开通冲突，请稍后重试'
    case 'invalid_api_key':
      return '网关凭证无效或已失效，请重置网关凭证'
    case 'key_disabled':
      return '网关 Key 已禁用，请重置或联系运营'
    case 'network':
      return '无法连接 Token 网关，请检查网关地址与网络'
    case 'empty_models':
      return '开通成功，但暂无可用模型。请联系运营检查价目与白名单'
    default:
      return fallback || '网关请求失败'
  }
}

async function readErrorBody(res: Response): Promise<{ reason: string; text: string }> {
  const text = await res.text()
  let reason = ''
  try {
    const json = JSON.parse(text) as { error?: string; message?: string; reason?: string }
    reason = String(json.reason || json.error || json.message || '').trim()
  } catch {
    reason = text.slice(0, 200).trim()
  }
  if (!reason) reason = res.statusText || `HTTP ${res.status}`
  return { reason, text }
}

/**
 * POST {base}/keys/rotate — UC JWT
 */
export async function rotateKey(input: {
  accessToken: string
  name?: string
  baseUrl?: string
}): Promise<RotateKeySuccess | GatewayClientError> {
  const base = input.baseUrl || getTokenGatewayBaseUrl()
  const name = (input.name || FTCS_GATEWAY_KEY_NAME).trim()
  const url = `${base}/keys/rotate`
  log('rotate start', {
    url,
    name,
    accessToken: maskSecretForLog(input.accessToken),
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const { reason, text } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'rotate')
      logWarn('rotate http error', {
        status: res.status,
        code,
        reason,
        bodyPreview: text.slice(0, 300),
      })
      return {
        ok: false,
        code,
        message: userMessage(code, reason),
        httpStatus: res.status,
        reason,
      }
    }
    const json = (await res.json()) as {
      action?: string
      name?: string
      api_key?: string
      prefix?: string
      user?: { balance_li?: number }
    }
    const apiKey = (json.api_key || '').trim()
    if (!apiKey) {
      logWarn('rotate missing api_key', { status: res.status, action: json.action })
      return {
        ok: false,
        code: 'unknown',
        message: '网关未返回 api_key',
        httpStatus: res.status,
      }
    }
    log('rotate ok', {
      action: json.action || 'created',
      name: json.name || name,
      prefix: json.prefix || '',
      apiKey: maskSecretForLog(apiKey),
      balanceLi:
        typeof json.user?.balance_li === 'number' ? json.user.balance_li : undefined,
    })
    return {
      ok: true,
      action: json.action || 'created',
      name: json.name || name,
      apiKey,
      prefix: json.prefix || '',
      balanceLi:
        typeof json.user?.balance_li === 'number' ? json.user.balance_li : undefined,
    }
  } catch (err) {
    logWarn('rotate network error', err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      code: 'network',
      message: userMessage(
        'network',
        err instanceof Error ? err.message : String(err),
      ),
    }
  }
}

/**
 * GET {base}/models — 网关 sk
 */
export async function listModels(input: {
  apiKey: string
  baseUrl?: string
}): Promise<ListModelsSuccess | GatewayClientError> {
  const base = input.baseUrl || getTokenGatewayBaseUrl()
  const url = `${base}/models`
  log('models start', {
    url,
    apiKey: maskSecretForLog(input.apiKey),
  })
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const { reason, text } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'models')
      logWarn('models http error', {
        status: res.status,
        code,
        reason,
        bodyPreview: text.slice(0, 300),
      })
      return {
        ok: false,
        code,
        message: userMessage(code, reason),
        httpStatus: res.status,
        reason,
      }
    }
    const json = (await res.json()) as {
      data?: Array<{
        id?: string
        owned_by?: string
        input_types?: unknown
        output_types?: unknown
      }>
    }
    const models = (json.data || [])
      .map((m) => parseGatewayModel(m))
      .filter((m): m is GatewayModel => Boolean(m))
    if (models.length === 0) {
      logWarn('models empty list', { status: res.status })
      return {
        ok: false,
        code: 'empty_models',
        message: userMessage('empty_models', ''),
      }
    }
    log('models ok', {
      count: models.length,
      ids: models.map((m) => m.id),
    })
    return { ok: true, models }
  } catch (err) {
    logWarn('models network error', err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      code: 'network',
      message: userMessage(
        'network',
        err instanceof Error ? err.message : String(err),
      ),
    }
  }
}

/**
 * GET {base}/usage/me — 网关 sk（G0-16：本期仅余额）
 */
export async function getUsageMe(input: {
  apiKey: string
  baseUrl?: string
}): Promise<UsageMeSuccess | GatewayClientError> {
  const base = input.baseUrl || getTokenGatewayBaseUrl()
  const url = `${base}/usage/me`
  log('usage/me start', {
    url,
    apiKey: maskSecretForLog(input.apiKey),
  })
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const { reason, text } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'usage')
      logWarn('usage/me http error', {
        status: res.status,
        code,
        reason,
        bodyPreview: text.slice(0, 300),
      })
      return {
        ok: false,
        code,
        message:
          code === 'invalid_api_key' || code === 'key_disabled'
            ? userMessage(code, reason)
            : `无法获取余额：${userMessage(code, reason)}`,
        httpStatus: res.status,
        reason,
      }
    }
    const json = (await res.json()) as {
      balance_li?: number
      li_per_yuan?: number
      key?: { prefix?: string; name?: string }
      today?: {
        prompt_tokens?: number
        completion_tokens?: number
      }
    }
    const balanceLi = Number(json.balance_li)
    if (!Number.isFinite(balanceLi)) {
      logWarn('usage/me missing balance_li', { status: res.status })
      return {
        ok: false,
        code: 'unknown',
        message: '无法获取余额：响应缺少 balance_li',
        httpStatus: res.status,
      }
    }
    const liPerYuan =
      typeof json.li_per_yuan === 'number' && json.li_per_yuan > 0
        ? json.li_per_yuan
        : 1000
    const today = json.today
    log('usage/me ok', {
      balanceLi,
      liPerYuan,
      keyPrefix: json.key?.prefix,
      keyName: json.key?.name,
      hasToday: Boolean(today),
    })
    return {
      ok: true,
      balanceLi,
      liPerYuan,
      keyPrefix: json.key?.prefix,
      keyName: json.key?.name,
      todayPromptTokens:
        today && typeof today.prompt_tokens === 'number'
          ? today.prompt_tokens
          : null,
      todayCompletionTokens:
        today && typeof today.completion_tokens === 'number'
          ? today.completion_tokens
          : null,
    }
  } catch (err) {
    logWarn('usage/me network error', err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      code: 'network',
      message: `无法获取余额：${userMessage(
        'network',
        err instanceof Error ? err.message : String(err),
      )}`,
    }
  }
}

export interface RechargeTicketSuccess {
  ok: true
  ticket: string
  expiresIn: number
  expiresAt?: string
}

/**
 * POST {base}/billing/recharge/ticket — UC JWT（US-G3-04 / G3-06）
 */
export async function createRechargeTicket(input: {
  accessToken: string
  baseUrl?: string
}): Promise<RechargeTicketSuccess | GatewayClientError> {
  const base = input.baseUrl || getTokenGatewayBaseUrl()
  const url = `${base}/billing/recharge/ticket`
  log('recharge ticket start', {
    url,
    accessToken: maskSecretForLog(input.accessToken),
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const { reason, text } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'recharge_ticket')
      logWarn('recharge ticket http error', {
        status: res.status,
        code,
        reason,
        bodyPreview: text.slice(0, 300),
      })
      const message =
        code === 'need_login'
          ? '请先登录后再充值'
          : code === 'network'
            ? '无法打开充值页，请稍后重试'
            : reason
              ? `无法打开充值页：${reason}`
              : '无法打开充值页，请稍后重试'
      return {
        ok: false,
        code,
        message,
        httpStatus: res.status,
        reason,
      }
    }
    const json = (await res.json()) as {
      ticket?: string
      expires_in?: number
      expires_at?: string
    }
    const ticket = (json.ticket || '').trim()
    if (!ticket.startsWith('rt_')) {
      logWarn('recharge ticket missing or invalid', {
        status: res.status,
        ticket: maskSecretForLog(ticket),
      })
      return {
        ok: false,
        code: 'unknown',
        message: '无法打开充值页：网关未返回有效 ticket',
        httpStatus: res.status,
      }
    }
    const expiresIn =
      typeof json.expires_in === 'number' && json.expires_in > 0
        ? Math.floor(json.expires_in)
        : 300
    log('recharge ticket ok', {
      ticket: maskSecretForLog(ticket),
      expiresIn,
    })
    return {
      ok: true,
      ticket,
      expiresIn,
      expiresAt: typeof json.expires_at === 'string' ? json.expires_at : undefined,
    }
  } catch (err) {
    logWarn(
      'recharge ticket network error',
      err instanceof Error ? err.message : String(err),
    )
    return {
      ok: false,
      code: 'network',
      message: '无法打开充值页，请稍后重试',
    }
  }
}
