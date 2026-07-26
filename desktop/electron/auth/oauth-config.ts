import { getUserOrigin } from '../config/site-origins'

/**
 * OAuth 2.0（授权码 + PKCE）配置。
 * 回调为 loopback；端口默认每次登录动态分配（管理端按 RFC 8252 允许任意端口）。
 * Scope：openid ftcs-desktop email。
 */
export interface OAuthConfig {
  issuer: string
  clientId: string
  scopes: string[]
  loopbackHost: string
  /**
   * 优先使用的端口；0 表示由系统分配空闲端口。
   * 可用 FTCS_OAUTH_LOOPBACK_PORT 强制固定端口。
   */
  preferredLoopbackPort: number
  redirectPath: string
}

export function getOAuthConfig(): OAuthConfig {
  // FTCS_OAUTH_ISSUER 优先；否则 FTCS_USER_ORIGIN；再默认 user.ai-utills.com
  const issuer = (
    process.env.FTCS_OAUTH_ISSUER?.trim() || getUserOrigin()
  ).replace(/\/$/, '')
  const clientId = process.env.FTCS_OAUTH_CLIENT_ID || 'ftcs-desktop'
  const preferredRaw = process.env.FTCS_OAUTH_LOOPBACK_PORT
  const preferredLoopbackPort =
    preferredRaw != null && preferredRaw !== ''
      ? Number(preferredRaw)
      : 0
  const scopeEnv = process.env.FTCS_OAUTH_SCOPES
  const scopes = scopeEnv
    ? scopeEnv.split(/[\s,+]+/).filter(Boolean)
    : ['openid', 'ftcs-desktop', 'email']

  return {
    issuer,
    clientId,
    scopes,
    loopbackHost: '127.0.0.1',
    preferredLoopbackPort:
      Number.isFinite(preferredLoopbackPort) && preferredLoopbackPort >= 0
        ? preferredLoopbackPort
        : 0,
    redirectPath: '/callback',
  }
}

export function buildRedirectUri(
  port: number,
  config = getOAuthConfig(),
): string {
  return `http://${config.loopbackHost}:${port}${config.redirectPath}`
}

/** 会话展示用：动态端口时显示占位说明 */
export function getRedirectUriHint(config = getOAuthConfig()): string {
  if (config.preferredLoopbackPort > 0) {
    return buildRedirectUri(config.preferredLoopbackPort, config)
  }
  return `http://${config.loopbackHost}:<动态端口>${config.redirectPath}`
}

export function getAuthorizeUrl(config = getOAuthConfig()): string {
  return `${config.issuer}/oauth2/authorize`
}

export function getTokenUrl(config = getOAuthConfig()): string {
  return `${config.issuer}/oauth2/token`
}

export function getUserInfoUrl(config = getOAuthConfig()): string {
  return `${config.issuer}/oauth2/userinfo`
}

export function getRevokeUrl(config = getOAuthConfig()): string {
  return `${config.issuer}/oauth2/revoke`
}

export function getFeedbackUrl(config = getOAuthConfig()): string {
  return `${config.issuer}/oauth2/feedback`
}
