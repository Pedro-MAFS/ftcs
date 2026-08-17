import { useHead } from '@unhead/vue'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { siteConfig } from '../config/site'

const SITE_NAME = `${siteConfig.brand} · ${siteConfig.productName}`

export type PageSeoInput = {
  title?: string
  description: string
}

function toHeadConfig(value: PageSeoInput) {
  const title = value.title ? `${value.title} · ${SITE_NAME}` : SITE_NAME
  return {
    title,
    meta: [
      { name: 'description', content: value.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: value.description },
      { property: 'og:type', content: 'website' },
    ],
  }
}

/** 统一设置页面 title / description（SSG 会写入静态 HTML） */
export function usePageSeo(opts: PageSeoInput) {
  useHead(toHeadConfig(opts))
}

/** 文档页：随 slug 响应式更新 SEO */
export function useDocPageSeo(get: MaybeRefOrGetter<PageSeoInput>) {
  useHead(computed(() => toHeadConfig(toValue(get))))
}
