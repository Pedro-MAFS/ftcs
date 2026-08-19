import { PRODUCT_BASE_URL } from './site-origins'

/** 产品官网与帮助文档（外链，由系统浏览器打开） */
export const PRODUCT_LINKS = {
  website: `${PRODUCT_BASE_URL}/`,
  docs: `${PRODUCT_BASE_URL}/docs/`,
  docsInstall: `${PRODUCT_BASE_URL}/docs/install`,
  /** 常见问题：为什么需要模型提供商 */
  docsFaqModel: `${PRODUCT_BASE_URL}/docs/faq#model-provider`,
  /** 常见问题：什么是 Tavily 搜索服务 */
  docsFaqSearch: `${PRODUCT_BASE_URL}/docs/faq#tavily-search`,
  download: `${PRODUCT_BASE_URL}/download/`,
  /** 版本发布日志（可带 ?from=&to= 对照区间） */
  changelog: `${PRODUCT_BASE_URL}/changelog/`,
  /** 桌面端检查更新用的版本清单 */
  updateManifest: `${PRODUCT_BASE_URL}/updates/latest.json`,
  nodejs: 'https://nodejs.org/',
  chrome: 'https://www.google.com/chrome/',
  /** DeepSeek 开放平台（注册与 API Key） */
  deepseek: 'https://platform.deepseek.com/',
  /** Tavily 官网（注册与 API Key） */
  tavily: 'https://tavily.com/',
} as const

export type ProductLinkId = keyof typeof PRODUCT_LINKS

/** 打开发布日志并带上当前 / 目标版本，便于对照差异 */
export function changelogPageUrl(opts?: { from?: string; to?: string }): string {
  const params = new URLSearchParams()
  if (opts?.from) params.set('from', opts.from)
  if (opts?.to) params.set('to', opts.to)
  const query = params.toString()
  return query ? `${PRODUCT_LINKS.changelog}?${query}` : PRODUCT_LINKS.changelog
}
