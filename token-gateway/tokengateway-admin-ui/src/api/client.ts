const apiBase = (import.meta.env.VITE_ADMIN_API_BASE || '').replace(/\/$/, '')

export function adminUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${apiBase}${p}`
}

export class AdminApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
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
    let code: string | undefined
    try {
      const body = (await res.json()) as { message?: string; error?: string; code?: string }
      message = body.message || body.error || message
      code = body.code
    } catch {
      // ignore non-JSON error body
    }
    throw new AdminApiError(res.status, message, code)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
