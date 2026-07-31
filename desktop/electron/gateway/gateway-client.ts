import {
  FTCS_GATEWAY_KEY_NAME,
  getTokenGatewayBaseUrl,
} from './gateway-config'

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

export interface ListModelsSuccess {
  ok: true
  models: Array<{ id: string; ownedBy?: string }>
}

function mapReasonToCode(
  httpStatus: number,
  reason: string,
  kind: 'rotate' | 'models',
): GatewayHttpErrorCode {
  const r = reason.toLowerCase()
  if (
    httpStatus === 401 ||
    r.includes('missing_authentication') ||
    r.includes('anonymous') ||
    r.includes('missing_identity')
  ) {
    return kind === 'models' ? 'invalid_api_key' : 'need_login'
  }
  if (r.includes('invalid_api_key') || r.includes('invalid_authorization') || r.includes('missing_authorization')) {
    return 'invalid_api_key'
  }
  if (r.includes('account_disabled')) return 'account_disabled'
  if (r.includes('key_disabled')) return 'key_disabled'
  if (r.includes('invalid_name')) return 'invalid_name'
  if (httpStatus === 409 || r.includes('conflict')) return 'conflict'
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
      const { reason } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'rotate')
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
      return {
        ok: false,
        code: 'unknown',
        message: '网关未返回 api_key',
        httpStatus: res.status,
      }
    }
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
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const { reason } = await readErrorBody(res)
      const code = mapReasonToCode(res.status, reason, 'models')
      return {
        ok: false,
        code,
        message: userMessage(code, reason),
        httpStatus: res.status,
        reason,
      }
    }
    const json = (await res.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>
    }
    const models = (json.data || [])
      .map((m) => ({
        id: String(m.id || '').trim(),
        ownedBy: m.owned_by,
      }))
      .filter((m) => Boolean(m.id))
    if (models.length === 0) {
      return {
        ok: false,
        code: 'empty_models',
        message: userMessage('empty_models', ''),
      }
    }
    return { ok: true, models }
  } catch (err) {
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
