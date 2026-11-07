export interface BrowserTitleInput {
  key: string
  url: string
}

/** 主视图短标题。地址栏仍用完整 URL，不使用文档标题。 */
export function browserTabTitles(tabs: BrowserTitleInput[]): Map<string, string> {
  const hosts = tabs.map((tab) => httpHost(tab.url))
  const hostCount = new Map<string, number>()
  for (const host of hosts) {
    if (!host) continue
    hostCount.set(host, (hostCount.get(host) ?? 0) + 1)
  }

  const labels = tabs.map((tab, index) => {
    const host = hosts[index]
    if (!host) return '浏览器'
    if ((hostCount.get(host) ?? 0) < 2) return host
    const segment = firstPathSegment(tab.url)
    return segment ? `${host}/${segment}` : host
  })

  const seen = new Map<string, number>()
  const titles = new Map<string, string>()
  tabs.forEach((tab, index) => {
    const host = hosts[index]
    const label = labels[index] ?? '浏览器'
    if (!host || (hostCount.get(host) ?? 0) < 2) {
      titles.set(tab.key, label)
      return
    }
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    titles.set(tab.key, count === 1 ? label : `${label} ·${count}`)
  })
  return titles
}

function httpHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname.replace(/^www\./i, '')
  } catch {
    return null
  }
}

function firstPathSegment(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname.split('/').filter(Boolean)[0] ?? ''
  } catch {
    return ''
  }
}
