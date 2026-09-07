export type GoogleProxyMode = 'off' | 'system' | 'manual'

export const GOOGLE_PROXY_MODE_ENV = 'FTCS_GOOGLE_PROXY_MODE'
export const GOOGLE_PROXY_URL_ENV = 'FTCS_GOOGLE_PROXY_URL'
export const GOOGLE_PROXY_RESOLVED_ENV = 'FTCS_GOOGLE_PROXY_RESOLVED'
export const GOOGLE_PLACES_TEST_URL =
  'https://places.googleapis.com/v1/places:searchText'

export interface GoogleProxyResolution {
  mode: GoogleProxyMode
  url: string | null
  systemRule?: string
}

export function parseGoogleProxyMode(raw: string | undefined): GoogleProxyMode {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'system' || value === 'manual' || value === 'off') {
    return value
  }
  return 'system'
}

/** 将用户输入规范为代理 URL；支持 host:port */
export function normalizeGoogleProxyUrl(input: string | undefined): string | null {
  const trimmed = (input || '').trim()
  if (!trimmed) return null
  if (/^(https?|socks5?):\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

/**
 * 解析 Electron session.resolveProxy 返回的规则。
 * 例：`PROXY 127.0.0.1:7890`、`SOCKS5 127.0.0.1:7891`、`PROXY host:7890; DIRECT`
 */
export function parseElectronProxyRule(rule: string): string | null {
  const trimmed = rule.trim()
  if (!trimmed) return null

  const first = trimmed.split(';')[0]?.trim() ?? trimmed
  if (!first || first.toUpperCase() === 'DIRECT') return null

  const proxyMatch = /^PROXY\s+(\S+)/i.exec(first)
  if (proxyMatch) {
    return normalizeGoogleProxyUrl(`http://${proxyMatch[1]}`)
  }

  const httpsMatch = /^HTTPS\s+(\S+)/i.exec(first)
  if (httpsMatch) {
    return normalizeGoogleProxyUrl(`https://${httpsMatch[1]}`)
  }

  const socksMatch = /^SOCKS5?\s+(\S+)/i.exec(first)
  if (socksMatch) {
    return normalizeGoogleProxyUrl(`socks5://${socksMatch[1]}`)
  }

  return null
}

export async function resolveSystemGoogleProxyUrl(
  testUrl = GOOGLE_PLACES_TEST_URL,
): Promise<{ rule: string; url: string | null }> {
  const { session } = await import('electron')
  const rule = await session.defaultSession.resolveProxy(testUrl)
  return { rule, url: parseElectronProxyRule(rule) }
}

export async function resolveEffectiveGoogleProxyUrl(
  env: Record<string, string | undefined>,
): Promise<GoogleProxyResolution> {
  const mode = parseGoogleProxyMode(env[GOOGLE_PROXY_MODE_ENV])
  if (mode === 'off') {
    return { mode, url: null }
  }
  if (mode === 'manual') {
    return {
      mode,
      url: normalizeGoogleProxyUrl(env[GOOGLE_PROXY_URL_ENV]),
    }
  }

  const system = await resolveSystemGoogleProxyUrl()
  return {
    mode,
    url: system.url,
    systemRule: system.rule,
  }
}

export function buildGoogleProxyEnvVars(
  url: string | null | undefined,
): Record<string, string> {
  const normalized = url ? normalizeGoogleProxyUrl(url) : null
  if (!normalized) return {}
  return {
    [GOOGLE_PROXY_URL_ENV]: normalized,
    HTTPS_PROXY: normalized,
    HTTP_PROXY: normalized,
  }
}

/** 按当前 .env / process.env 解析并写入 FTCS_GOOGLE_PROXY_RESOLVED，供 MCP 注入。 */
export async function refreshGoogleProxyResolution(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): Promise<GoogleProxyResolution> {
  const resolved = await resolveEffectiveGoogleProxyUrl(env)
  if (resolved.url) {
    process.env[GOOGLE_PROXY_RESOLVED_ENV] = resolved.url
  } else {
    delete process.env[GOOGLE_PROXY_RESOLVED_ENV]
  }
  return resolved
}
