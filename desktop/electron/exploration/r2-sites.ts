import fs from 'node:fs'
import path from 'node:path'

export type ExploreR2SiteRecord = {
  id: string
  label: string
  include_domains: string[]
  default_enabled: boolean
}

export type ExploreR2SiteDto = ExploreR2SiteRecord & {
  enabled: boolean
}

export const DEFAULT_EXPLORE_R2_SITES: ExploreR2SiteRecord[] = [
  {
    id: 'linkedin_company',
    label: 'LinkedIn 公司页',
    include_domains: ['linkedin.com/company'],
    default_enabled: true,
  },
  {
    id: 'facebook_page',
    label: 'Facebook 公共主页',
    include_domains: ['facebook.com'],
    default_enabled: true,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    include_domains: ['instagram.com'],
    default_enabled: false,
  },
  {
    id: 'x',
    label: 'X',
    include_domains: ['x.com'],
    default_enabled: false,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    include_domains: ['tiktok.com'],
    default_enabled: false,
  },
]

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseExploreR2SitesYaml(text: string): ExploreR2SiteRecord[] {
  const sites: ExploreR2SiteRecord[] = []
  let current: {
    id?: string
    label?: string
    include_domains: string[]
    default_enabled: boolean
  } | null = null
  let inDomains = false

  const flush = (): void => {
    if (!current?.id || !current.label || current.include_domains.length === 0) {
      if (current?.id) {
        console.warn(`[explore-r2-sites] skip invalid site: ${current.id}`)
      }
      current = null
      inDomains = false
      return
    }
    sites.push({
      id: current.id,
      label: current.label,
      include_domains: current.include_domains,
      default_enabled: current.default_enabled,
    })
    current = null
    inDomains = false
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.replace(/#.*$/, '').trim()
    if (!trimmed) continue
    if (trimmed === 'sites:') {
      inDomains = false
      continue
    }

    const idMatch = trimmed.match(/^- id:\s*(.+)$/)
    if (idMatch) {
      flush()
      current = {
        id: unquote(idMatch[1]),
        include_domains: [],
        default_enabled: false,
      }
      inDomains = false
      continue
    }

    if (!current) continue

    if (trimmed === 'include_domains:') {
      inDomains = true
      continue
    }

    if (inDomains && trimmed.startsWith('- ')) {
      const domain = unquote(trimmed.slice(2))
      if (domain) current.include_domains.push(domain)
      continue
    }

    inDomains = false

    const labelMatch = trimmed.match(/^label:\s*(.+)$/)
    if (labelMatch) {
      current.label = unquote(labelMatch[1])
      continue
    }

    const enabledMatch = trimmed.match(/^default_enabled:\s*(true|false)$/i)
    if (enabledMatch) {
      current.default_enabled = enabledMatch[1].toLowerCase() === 'true'
    }
  }

  flush()
  return sites
}

function registryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'config', 'explore-r2-sites.yaml')
}

function prefsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'prefs', 'explore-r2.json')
}

export function loadExploreR2Registry(workspaceRoot: string): ExploreR2SiteRecord[] {
  const file = registryPath(workspaceRoot)
  if (!fs.existsSync(file)) {
    return DEFAULT_EXPLORE_R2_SITES
  }
  try {
    const parsed = parseExploreR2SitesYaml(fs.readFileSync(file, 'utf8'))
    return parsed.length ? parsed : DEFAULT_EXPLORE_R2_SITES
  } catch (err) {
    console.warn('[explore-r2-sites] failed to read yaml, using defaults', err)
    return DEFAULT_EXPLORE_R2_SITES
  }
}

function loadEnabledOverrides(workspaceRoot: string): Record<string, boolean> {
  const file = prefsPath(workspaceRoot)
  if (!fs.existsSync(file)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      enabled?: Record<string, unknown>
    }
    const enabled = raw.enabled
    if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)) {
      return {}
    }
    const next: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(enabled)) {
      if (typeof value === 'boolean') next[key] = value
    }
    return next
  } catch {
    return {}
  }
}

export function listExploreR2Sites(workspaceRoot: string): ExploreR2SiteDto[] {
  const registry = loadExploreR2Registry(workspaceRoot)
  const overrides = loadEnabledOverrides(workspaceRoot)
  return registry.map((site) => ({
    ...site,
    enabled: overrides[site.id] ?? site.default_enabled,
  }))
}

export function setExploreR2SiteEnabled(
  workspaceRoot: string,
  siteId: string,
  enabled: boolean,
): ExploreR2SiteDto[] {
  const registry = loadExploreR2Registry(workspaceRoot)
  const known = new Set(registry.map((site) => site.id))
  if (!known.has(siteId)) {
    throw new Error(`未知的 R2 站点：${siteId}`)
  }

  const overrides = loadEnabledOverrides(workspaceRoot)
  overrides[siteId] = enabled
  const filtered: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (known.has(key)) filtered[key] = value
  }

  const file = prefsPath(workspaceRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ enabled: filtered }, null, 2)}\n`,
    'utf8',
  )
  return listExploreR2Sites(workspaceRoot)
}

export function formatR2IncludeDomainsForPrompt(sites: ExploreR2SiteRecord[]): string {
  if (!sites.length) {
    return '未读到 R2 站点登记表。请读取工作区 config/explore-r2-sites.yaml，按词上的 site_id 取 include_domains。'
  }
  const lines = sites.map(
    (site) => `- ${site.id}（${site.label}）：${site.include_domains.join(', ')}`,
  )
  return `R2 站点对照表（search_web 的 include_domains 必须用下列原串，不要写 site:）：\n${lines.join('\n')}`
}

export function formatEnabledR2SitesForPrompt(sites: ExploreR2SiteDto[]): string {
  const enabled = sites.filter((site) => site.enabled)
  if (!enabled.length) {
    return '当前没有启用的 R2 站点：不要生成 round=R2 的 search_queries。R1 与 R3 仍按任务指令中的目标生成。'
  }
  const lines = enabled.map((site) => `- ${site.id}（${site.label}）`)
  return `当前启用的 R2 站点（每条 R2 词的 site_id 必须是下列之一）：\n${lines.join('\n')}`
}
