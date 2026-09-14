import { readHunterKeysFromEnv } from './hunter-keys'

export interface HunterKeyTestItem {
  tail: string
  ok: boolean
  message: string
  remaining?: number | null
  resetDate?: string | null
  planName?: string | null
}

export interface HunterTestResult {
  ok: boolean
  message: string
  keys: HunterKeyTestItem[]
}

function keyTail(apiKey: string): string {
  return apiKey.slice(-4)
}

async function fetchAccount(apiKey: string): Promise<{
  ok: boolean
  message: string
  remaining?: number | null
  resetDate?: string | null
  planName?: string | null
  httpStatus?: number
}> {
  try {
    const res = await fetch('https://api.hunter.io/v2/account', {
      headers: { 'X-API-Key': apiKey },
    })
    if (res.status === 401) {
      return {
        ok: false,
        message: 'Key 无效',
        httpStatus: 401,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        httpStatus: res.status,
      }
    }
    const body = (await res.json()) as {
      data?: {
        plan_name?: string | null
        reset_date?: string | null
        requests?: {
          credits?: { remaining?: number }
          searches?: { remaining?: number }
        }
      }
    }
    const data = body.data
    const remaining =
      data?.requests?.credits?.remaining ??
      data?.requests?.searches?.remaining ??
      null
    return {
      ok: true,
      message: remaining != null ? `剩余 ${remaining}` : '连接成功',
      remaining,
      resetDate: data?.reset_date ?? null,
      planName: data?.plan_name ?? null,
      httpStatus: 200,
    }
  } catch (error) {
    return {
      ok: false,
      message: `无法连接 Hunter：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 设置页「测试连接」：直调 /account，不启 MCP。
 * 使用已保存到 process.env 的 Key（与 Places 测试一致）。
 */
export async function testHunterConnectivity(): Promise<HunterTestResult> {
  const keys = readHunterKeysFromEnv({
    HUNTER_API_KEYS: process.env.HUNTER_API_KEYS || '',
    HUNTER_API_KEY: process.env.HUNTER_API_KEY || '',
  })
  if (keys.length === 0) {
    return {
      ok: false,
      message: '未配置 Hunter API Key。请先填写并保存后再测试。',
      keys: [],
    }
  }

  const items: HunterKeyTestItem[] = []
  for (const key of keys) {
    const result = await fetchAccount(key)
    items.push({
      tail: keyTail(key),
      ok: result.ok,
      message: result.message,
      remaining: result.remaining,
      resetDate: result.resetDate,
      planName: result.planName,
    })
  }

  const okCount = items.filter((item) => item.ok).length
  if (okCount === 0) {
    return {
      ok: false,
      message: `全部 ${items.length} 个 Key 均不可用`,
      keys: items,
    }
  }
  return {
    ok: true,
    message: `${okCount}/${items.length} 个 Key 可用`,
    keys: items,
  }
}
