import type { AppStatus } from '../types/app'

const DEFAULT_TIMEOUT_MS = 10_000

export async function fetchOpenCodeHealth(baseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/global/health`, { signal: controller.signal })
    if (!res.ok) return false
    const data = (await res.json()) as { healthy?: boolean }
    return data.healthy !== false
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchOpenCodeMcp(baseUrl: string): Promise<AppStatus['mcpServers']> {
  const res = await fetch(`${baseUrl}/mcp`)
  if (!res.ok) return []
  const data = (await res.json()) as Record<string, { status?: string; error?: string }>
  return Object.entries(data).map(([name, info]) => ({
    name,
    status: info.status ?? 'unknown',
    ...(info.error ? { error: info.error } : {}),
  }))
}
