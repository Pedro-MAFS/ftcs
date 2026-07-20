/** 产品官网与帮助文档（外链，由系统浏览器打开） */
export const PRODUCT_LINKS = {
  website: 'https://ai-utills.com/ftcs/',
  docs: 'https://ai-utills.com/ftcs/docs/',
  docsInstall: 'https://ai-utills.com/ftcs/docs/install',
  /** 常见问题：为什么需要模型提供商 */
  docsFaqModel: 'https://ai-utills.com/ftcs/docs/faq#model-provider',
  /** 常见问题：什么是 Tavily 搜索服务 */
  docsFaqSearch: 'https://ai-utills.com/ftcs/docs/faq#tavily-search',
  download: 'https://ai-utills.com/ftcs/download/',
  /** 桌面端检查更新用的版本清单 */
  updateManifest: 'https://ai-utills.com/ftcs/updates/latest.json',
  nodejs: 'https://nodejs.org/',
  chrome: 'https://www.google.com/chrome/',
  /** DeepSeek 开放平台（注册与 API Key） */
  deepseek: 'https://platform.deepseek.com/',
  /** Tavily 官网（注册与 API Key） */
  tavily: 'https://tavily.com/',
} as const

export type ProductLinkId = keyof typeof PRODUCT_LINKS
