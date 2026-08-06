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

/**
 * 充值页所在 origin：去掉 base 末尾的 `/v1`（及多余 `/`）。
 * 例：`https://token.ai-utills.com/v1` → `https://token.ai-utills.com`
 */
export function getTokenGatewayOrigin(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const base = getTokenGatewayBaseUrl(env)
  const withoutV1 = base.replace(/\/v1$/i, '')
  return trimTrailingSlash(withoutV1 || base)
}

/**
 * 系统浏览器打开的充值页 URL（仅带短时 ticket，不含 JWT / sk）。
 */
export function buildRechargePageUrl(
  ticket: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const raw = (ticket || '').trim()
  const origin = getTokenGatewayOrigin(env)
  return `${origin}/billing/recharge?ticket=${encodeURIComponent(raw)}`
}

/**
 * 系统浏览器打开的用户面板 URL（复用同一短时 ticket）。
 */
export function buildPortalPageUrl(
  ticket: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const raw = (ticket || '').trim()
  const origin = getTokenGatewayOrigin(env)
  return `${origin}/billing/portal?ticket=${encodeURIComponent(raw)}`
}

export function getTokenGatewayEnvKey(): string {
  return ENV_KEY
}

export function getDefaultTokenGatewayBaseUrl(): string {
  return DEFAULT_BASE
}
