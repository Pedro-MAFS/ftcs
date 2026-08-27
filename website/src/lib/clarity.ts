import { siteConfig } from '../config/site'

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }

declare global {
  interface Window {
    clarity?: ClarityFn
  }
}

/**
 * 注入 Microsoft Clarity 脚本。
 * 仅生产构建且配置了 siteConfig.clarityProjectId 时生效；SSG 构建期与本地 dev 不加载。
 * SPA 路由切换由 Clarity 自动侦测 history 变化，无需手动上报 pageview。
 */
export function initClarity(): void {
  const id = siteConfig.clarityProjectId
  if (!id || !import.meta.env.PROD || typeof document === 'undefined') return
  if (window.clarity) return

  const clarity: ClarityFn = (...args) => {
    ;(clarity.q ??= []).push(args)
  }
  window.clarity = clarity

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.clarity.ms/tag/${id}`
  const first = document.getElementsByTagName('script')[0]
  first?.parentNode?.insertBefore(script, first)
}
