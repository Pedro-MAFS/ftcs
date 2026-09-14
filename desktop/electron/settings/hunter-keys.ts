import { isMaskedSecret, maskSecret } from '../config/env-file'

/** 设置页最多可配置的 Hunter Key 数 */
export const HUNTER_API_KEYS_MAX = 5

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

/**
 * 按槽位解析保存结果：空槽跳过；掩码槽按 mask 匹配保留原 Key；明文为新 Key。
 * 因此可单独删掉某一格而不必清空全部。
 */
export function resolveHunterApiKeysSlots(
  slots: string[],
  prevKeys: string[],
): string[] {
  const usedPrev = new Set<number>()
  const next: string[] = []
  for (const raw of slots.slice(0, HUNTER_API_KEYS_MAX)) {
    const slot = raw.trim()
    if (!slot) continue
    if (isMaskedSecret(slot)) {
      const idx = prevKeys.findIndex(
        (key, i) => !usedPrev.has(i) && maskSecret(key) === slot,
      )
      if (idx >= 0) {
        usedPrev.add(idx)
        next.push(prevKeys[idx]!)
      }
      continue
    }
    if (!next.includes(slot)) next.push(slot)
  }
  return next
}

export function formatHunterKeysEnv(keys: string[]): string {
  return keys.join(',')
}

/** 未配置时默认开启验邮（与设置页勾选一致） */
export function parseHunterVerifyEmails(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === '') return true
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  return true
}

/** 从 .env 合并 HUNTER_API_KEYS + HUNTER_API_KEY */
export function readHunterKeysFromEnv(env: Record<string, string>): string[] {
  const multi = parseHunterApiKeysText(env.HUNTER_API_KEYS || '')
  const single = (env.HUNTER_API_KEY || '').trim()
  if (!single) return multi
  if (multi.includes(single)) return multi
  return [...multi, single]
}
