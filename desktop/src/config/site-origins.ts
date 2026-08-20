/**
 * 官网 / 用户中心域名（渲染进程）。
 * 构建时由 electron.vite.config 从 FTCS_SITE_ORIGIN / FTCS_USER_ORIGIN 注入；
 * 也可直接设 VITE_FTCS_SITE_ORIGIN / VITE_FTCS_USER_ORIGIN。
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export const SITE_ORIGIN = trimTrailingSlash(
  import.meta.env.VITE_FTCS_SITE_ORIGIN || 'https://ftcs.ai-utills.com',
)

export const USER_ORIGIN = trimTrailingSlash(
  import.meta.env.VITE_FTCS_USER_ORIGIN || 'https://user.ai-utills.com',
)

/** 产品站即官网根，如 https://ftcs.ai-utills.com */
export const PRODUCT_BASE_URL = SITE_ORIGIN
