/**
 * 解析 / 规范化 Hunter API Keys（US-C-03）。
 * 支持换行或逗号分隔；去空白、去重保序。
 */
export function parseHunterApiKeysText(raw: string): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const part of raw.split(/[\n,]+/)) {
    const key = part.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

/** 判断整段输入是否为「全掩码」（回写时不应覆盖） */
export function isHunterKeysMaskedInput(raw: string): boolean {
  const lines = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  return lines.every((line) => line.includes('•') || line.includes('*'))
}

export function formatHunterKeysEnv(keys: string[]): string {
  return keys.join(',')
}

/** 从 .env 合并 HUNTER_API_KEYS + HUNTER_API_KEY */
export function readHunterKeysFromEnv(env: Record<string, string>): string[] {
  const multi = parseHunterApiKeysText(env.HUNTER_API_KEYS || '')
  const single = (env.HUNTER_API_KEY || '').trim()
  if (!single) return multi
  if (multi.includes(single)) return multi
  return [...multi, single]
}
