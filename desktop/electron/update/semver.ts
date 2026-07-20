/**
 * 简易 semver 比较（支持 x.y.z，忽略前缀 v 与预发布后缀）。
 */
export function parseSemver(raw: string): [number, number, number] | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
  if (!cleaned) return null
  const parts = cleaned.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length < 1 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return null
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** a < b → -1；a == b → 0；a > b → 1；无法解析 → null */
export function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1
    if (pa[i] > pb[i]) return 1
  }
  return 0
}

export function isNewerVersion(remote: string, local: string): boolean {
  return compareSemver(remote, local) === 1
}
