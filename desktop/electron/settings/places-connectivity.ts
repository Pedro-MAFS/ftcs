import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { SocksProxyAgent } from 'socks-proxy-agent'
import {
  GOOGLE_PLACES_TEST_URL,
  type GoogleProxyMode,
  GOOGLE_PROXY_MODE_ENV,
  GOOGLE_PROXY_URL_ENV,
  normalizeGoogleProxyUrl,
  parseGoogleProxyMode,
  resolveEffectiveGoogleProxyUrl,
  resolveSystemGoogleProxyUrl,
} from '../config/google-proxy'

export interface GoogleProxyDetectResult {
  ok: boolean
  rule: string
  url: string | null
  message: string
}

export interface GooglePlacesTestResult {
  ok: boolean
  message: string
  proxyUrl?: string | null
  systemRule?: string
  httpStatus?: number
}

function createFetchWithProxy(proxyUrl: string): typeof fetch {
  const normalized = normalizeGoogleProxyUrl(proxyUrl)
  if (!normalized) return globalThis.fetch

  if (/^socks/i.test(normalized)) {
    const agent = new SocksProxyAgent(normalized)
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      undiciFetch(input, {
        ...init,
        dispatcher: agent,
      })) as typeof fetch
  }

  const agent = new ProxyAgent(normalized)
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input, {
      ...init,
      dispatcher: agent,
    })) as typeof fetch
}

export async function detectSystemGoogleProxy(): Promise<GoogleProxyDetectResult> {
  const { rule, url } = await resolveSystemGoogleProxyUrl()
  if (url) {
    return {
      ok: true,
      rule,
      url,
      message: `已检测到系统代理：${url}`,
    }
  }
  return {
    ok: true,
    rule,
    url: null,
    message:
      rule.trim().toUpperCase() === 'DIRECT'
        ? '系统当前为直连（DIRECT），未检测到可用代理。'
        : `未能解析系统代理规则：${rule}`,
  }
}

export async function testGooglePlacesConnectivity(options?: {
  apiKey?: string
  mode?: GoogleProxyMode
  manualProxyUrl?: string
}): Promise<GooglePlacesTestResult> {
  const env: Record<string, string | undefined> = {
    [GOOGLE_PROXY_MODE_ENV]: options?.mode ?? process.env[GOOGLE_PROXY_MODE_ENV],
    [GOOGLE_PROXY_URL_ENV]:
      options?.manualProxyUrl ?? process.env[GOOGLE_PROXY_URL_ENV],
  }

  const resolved = await resolveEffectiveGoogleProxyUrl(env)
  const apiKey =
    options?.apiKey?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim() || ''

  const fetchFn = resolved.url
    ? createFetchWithProxy(resolved.url)
    : globalThis.fetch

  try {
    const response = await fetchFn(GOOGLE_PLACES_TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Goog-Api-Key': apiKey } : {}),
        'X-Goog-FieldMask': 'places.id',
      },
      body: JSON.stringify({
        textQuery: 'coffee shop',
        languageCode: 'en',
        pageSize: 1,
      }),
    })

    if (response.ok) {
      return {
        ok: true,
        message: apiKey
          ? '已成功连接 Google Places API。'
          : '网络可达 Google Places（未校验 Key）。',
        proxyUrl: resolved.url,
        systemRule: resolved.systemRule,
        httpStatus: response.status,
      }
    }

    if (!apiKey && (response.status === 401 || response.status === 403)) {
      return {
        ok: true,
        message:
          '网络可达 Google Places（返回 401/403，请先配置 API Key 以完成完整校验）。',
        proxyUrl: resolved.url,
        systemRule: resolved.systemRule,
        httpStatus: response.status,
      }
    }

    if (apiKey && response.status === 403) {
      return {
        ok: false,
        message:
          '已连通 Google，但 API Key 被拒绝（403）。请检查 Key、Places API (New) 是否启用。',
        proxyUrl: resolved.url,
        systemRule: resolved.systemRule,
        httpStatus: response.status,
      }
    }

    return {
      ok: false,
      message: `Google Places 返回 HTTP ${response.status}，请检查代理与 Key。`,
      proxyUrl: resolved.url,
      systemRule: resolved.systemRule,
      httpStatus: response.status,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const mode = parseGoogleProxyMode(env[GOOGLE_PROXY_MODE_ENV])
    const hint =
      mode === 'off'
        ? '可在设置中启用「系统代理」或填写手动代理（如 http://127.0.0.1:7890）。'
        : resolved.url
          ? `当前代理：${resolved.url}。请确认 Clash 等工具已开启且端口正确。`
          : '未解析到可用代理。请开启系统代理或改用手动指定。'
    return {
      ok: false,
      message: `无法连接 Google Places：${message}。${hint}`,
      proxyUrl: resolved.url,
      systemRule: resolved.systemRule,
    }
  }
}
