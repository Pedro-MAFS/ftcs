/** 产品官网与帮助文档（外链，由系统浏览器打开） */
export const PRODUCT_LINKS = {
  website: 'https://ai-utills.com/ftcs/',
  docs: 'https://ai-utills.com/ftcs/docs/',
  download: 'https://ai-utills.com/ftcs/download/',
} as const

export type ProductLinkId = keyof typeof PRODUCT_LINKS
