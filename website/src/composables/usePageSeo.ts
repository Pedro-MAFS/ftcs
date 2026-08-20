import { useHead } from '@unhead/vue'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { absoluteUrl, ogImageUrl, siteConfig } from '../config/site'

const SITE_SUFFIX = `${siteConfig.brand} · ${siteConfig.productFullName}`

export type PageSeoInput = {
  title?: string
  /** true：title 原样写入，不拼站点后缀（首页 / 下载 / 帮助冻结文案） */
  absoluteTitle?: boolean
  description: string
  /** 站点内路径，如 `/download`，用于 canonical 与 og:url */
  path?: string
}

function resolveTitle(value: PageSeoInput): string {
  if (value.absoluteTitle && value.title) return value.title
  return value.title ? `${value.title} · ${SITE_SUFFIX}` : SITE_SUFFIX
}

function toHeadConfig(value: PageSeoInput) {
  const title = resolveTitle(value)
  const url = absoluteUrl(value.path ?? '/')
  const image = ogImageUrl()
  return {
    title,
    link: [{ rel: 'canonical', href: url }],
    meta: [
      { name: 'description', content: value.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: value.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: 'zh_CN' },
      { property: 'og:image', content: image },
      { property: 'og:site_name', content: `${siteConfig.brand} ${siteConfig.productFullName}` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: value.description },
      { name: 'twitter:image', content: image },
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
