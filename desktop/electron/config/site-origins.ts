/**
 * 官网 / 用户中心域名（主进程）。
 *
 * - FTCS_SITE_ORIGIN：产品官网根，默认 https://ai-utills.com
 * - FTCS_USER_ORIGIN：账号/OAuth 根，默认 https://user.ai-utills.com
 * - FTCS_OAUTH_ISSUER：可单独覆盖 OAuth issuer（未设时等于 FTCS_USER_ORIGIN）
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function getSiteOrigin(): string {
  return trimTrailingSlash(
    process.env.FTCS_SITE_ORIGIN?.trim() || 'https://ai-utills.com',
  )
}

export function getUserOrigin(): string {
  return trimTrailingSlash(
    process.env.FTCS_USER_ORIGIN?.trim() ||
      process.env.FTCS_OAUTH_ISSUER?.trim() ||
      'https://user.ai-utills.com',
  )
}

/** 产品站前缀，如 https://ai-utills.com/ftcs */
export function getProductBaseUrl(): string {
  return `${getSiteOrigin()}/ftcs`
}

export function getUpdateManifestUrl(): string {
  return `${getProductBaseUrl()}/updates/latest.json`
}

export function getDownloadPageUrl(): string {
  return `${getProductBaseUrl()}/download/`
}

export function getDocsInstallUrl(): string {
  return `${getProductBaseUrl()}/docs/install`
}

export function getDocsUrl(): string {
  return `${getProductBaseUrl()}/docs/`
}

export function getWebsiteUrl(): string {
  return `${getProductBaseUrl()}/`
}
