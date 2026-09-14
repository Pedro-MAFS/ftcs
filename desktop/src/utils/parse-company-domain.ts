/**
 * 从公司官网 URL 解析 eTLD+1 风格主机名（去协议、www、路径、端口）。
 * 不做公共后缀严格拆分：返回 hostname 去掉 leading www.（US-C-03）。
 */
export function parseCompanyDomain(website: string | null | undefined): string | null {
  const raw = (website ?? '').trim()
  if (!raw) return null

  let host = ''
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withScheme)
    host = url.hostname.toLowerCase()
  } catch {
    // 宽松回退：取第一个 / 前、去掉端口
    const stripped = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0] ?? ''
    host = stripped.split(':')[0]?.toLowerCase() ?? ''
  }

  if (!host || host.includes(' ') || !host.includes('.')) return null
  if (host.startsWith('www.')) host = host.slice(4)
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host)) return null
  return host
}
