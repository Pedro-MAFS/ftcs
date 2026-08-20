import { useHead } from '@unhead/vue'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  absoluteUrl,
  geoFaqs,
  ogImageUrl,
  seoCopy,
  siteConfig,
  type GeoFaqItem,
} from '../config/site'

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${siteConfig.brandSiteUrl}#organization`,
    name: siteConfig.brandSiteName,
    url: siteConfig.brandSiteUrl,
    sameAs: [absoluteUrl('/'), siteConfig.brandSiteUrl],
  }
}

function softwareNode() {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${absoluteUrl('/')}#software`,
    name: siteConfig.brand,
    alternateName: siteConfig.aliases,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Windows',
    url: absoluteUrl('/'),
    image: ogImageUrl(),
    description: seoCopy.home.description,
    downloadUrl: absoluteUrl('/download'),
    publisher: { '@id': `${siteConfig.brandSiteUrl}#organization` },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl('/download'),
      availability: 'https://schema.org/InStock',
    },
  }
}

function faqPageNode(faqs: GeoFaqItem[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${absoluteUrl('/docs/faq')}#faq`,
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

function graphScript(graph: unknown[]) {
  return {
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph,
    }),
  }
}

/** 全站：Organization + SoftwareApplication */
export function useSiteJsonLd() {
  useHead({
    script: [graphScript([organizationNode(), softwareNode()])],
  })
}

/** 首页 / FAQ 页：追加 FAQPage（与 geoFaqs 同一套问答） */
export function useFaqJsonLd(get: MaybeRefOrGetter<GeoFaqItem[] | null | undefined> = geoFaqs) {
  useHead(
    computed(() => {
      const faqs = toValue(get)
      if (!faqs?.length) return {}
      return {
        script: [graphScript([faqPageNode(faqs)])],
      }
    }),
  )
}
