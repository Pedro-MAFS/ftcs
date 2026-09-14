/**
 * Hunter BYOK 凭证读取（对齐 places-api/provider.ts）。
 *
 * - HUNTER_API_KEYS：逗号分隔多 Key（顺序即优先级）
 * - HUNTER_API_KEY：存量单 Key，兼容；与多 Key 并存时排在其后
 */
export function getHunterApiKeys(): string[] {
  const multi = (process.env.HUNTER_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  const single = process.env.HUNTER_API_KEY?.trim() ?? "";

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of [...multi, ...(single ? [single] : [])]) {
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}
