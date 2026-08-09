const apiBase = (import.meta.env.VITE_ADMIN_API_BASE || '').replace(/\/$/, '')

export function adminUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${apiBase}${p}`
}

export class AdminApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(adminUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string; error?: string }
      message = body.message || body.error || message
    } catch {
      // ignore non-JSON error body
    }
    throw new AdminApiError(res.status, message)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
