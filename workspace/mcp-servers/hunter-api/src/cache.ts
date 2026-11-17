import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getHunterCacheDir } from "./paths.js";
import type { TrimmedDomainSearch } from "./types.js";

/**
 * domain_search 结果缓存（US-C-02 详设 §5）：TTL 24h，防重复点击重复扣 credit。
 * 缓存键只含域名+参数，不含 API Key —— 多 Key 池共享缓存，换 Key 不击穿。
 * 读写异常静默降级为直调，不阻断主流程。
 */

const TTL_MS = 24 * 60 * 60 * 1000;

export interface DomainSearchCacheKey {
  domain: string;
  /** 未传是缺省，哈希段用空串，不要写成 10。 */
  limit?: number;
  type?: string;
  department?: string;
  seniority?: string;
  /** 未传与 0 都是第一页，哈希段写成 0。 */
  offset?: number;
}

/** 固定六段：domain|limit或空|type或空|department或空|seniority或空|offset。不含 Key、不含通道。 */
export function domainSearchCacheRaw(key: DomainSearchCacheKey): string {
  const limit = key.limit === undefined ? "" : String(key.limit);
  const offset = key.offset === undefined || key.offset === 0 ? "0" : String(key.offset);
  return [
    key.domain.toLowerCase(),
    limit,
    key.type ?? "",
    key.department ?? "",
    key.seniority ?? "",
    offset,
  ].join("|");
}

interface CacheEntry {
  cached_at: string;
  payload: TrimmedDomainSearch;
}

function cacheFilePath(root: string, key: DomainSearchCacheKey): string {
  const hash = createHash("sha256").update(domainSearchCacheRaw(key)).digest("hex").slice(0, 16);
  return join(getHunterCacheDir(root), "domain-search", `${hash}.json`);
}

export function readDomainSearchCache(
  root: string,
  key: DomainSearchCacheKey,
  now = Date.now()
): TrimmedDomainSearch | null {
  try {
    const file = cacheFilePath(root, key);
    if (!existsSync(file)) {
      return null;
    }
    const entry = JSON.parse(readFileSync(file, "utf8")) as CacheEntry;
    const cachedAt = Date.parse(entry.cached_at);
    if (!Number.isFinite(cachedAt) || now - cachedAt > TTL_MS) {
      return null;
    }
    return entry.payload;
  } catch {
    return null;
  }
}

export function writeDomainSearchCache(
  root: string,
  key: DomainSearchCacheKey,
  payload: TrimmedDomainSearch
): void {
  try {
    const file = cacheFilePath(root, key);
    mkdirSync(dirname(file), { recursive: true });
    const entry: CacheEntry = { cached_at: new Date().toISOString(), payload };
    writeFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // 静默降级
  }
}
