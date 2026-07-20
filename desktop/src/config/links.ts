/** 产品官网与帮助文档（外链，由系统浏览器打开） */
export const PRODUCT_LINKS = {
  website: 'https://ai-utills.com/ftcs/',
  docs: 'https://ai-utills.com/ftcs/docs/',
  docsInstall: 'https://ai-utills.com/ftcs/docs/install',
  download: 'https://ai-utills.com/ftcs/download/',
  /** 桌面端检查更新用的版本清单 */
  updateManifest: 'https://ai-utills.com/ftcs/updates/latest.json',
  nodejs: 'https://nodejs.org/',
  chrome: 'https://www.google.com/chrome/',
} as const

export type ProductLinkId = keyof typeof PRODUCT_LINKS
