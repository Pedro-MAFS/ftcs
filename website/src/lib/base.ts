/** 与 vite.config `base` 一致，用于 public 资源与 Markdown 站内链接 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return `${base}${normalized}`
}

/** 将 HTML 中站内绝对路径 href="/..." 加上部署前缀 */
export function rewriteHtmlHrefs(html: string): string {
  const base = import.meta.env.BASE_URL || '/'
  if (base === '/') return html
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base
  return html.replace(
    /href="\/(?!\/)([^"]*)"/g,
    (_m, rest: string) => `href="${prefix}/${rest}"`,
  )
}
