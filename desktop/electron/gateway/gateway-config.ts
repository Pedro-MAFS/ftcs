/**
 * Token 网关 baseURL（须含 /v1，与 OpenAI 兼容 base 一致）。
 * 代码只去尾 `/`，不再拼接 `/v1`。
 */

const ENV_KEY = 'FTCS_TOKEN_GATEWAY_BASE_URL'
const DEFAULT_BASE = 'https://token.ai-utills.com/v1'
export const FTCS_GATEWAY_KEY_NAME = 'ftcs-desktop'

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * 解析网关 OpenAI 兼容 base。
 * 优先级：显式 env 参数 → process.env → 默认。
 */
export function getTokenGatewayBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const raw = (env[ENV_KEY] || '').trim()
  return trimTrailingSlash(raw || DEFAULT_BASE)
}

export function getTokenGatewayEnvKey(): string {
  return ENV_KEY
}

export function getDefaultTokenGatewayBaseUrl(): string {
  return DEFAULT_BASE
}
