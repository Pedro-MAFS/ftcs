import { z } from "zod";

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  position: z.number().int().positive(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  language: z.string(),
  provider: z.string(),
  cached: z.boolean(),
  results: z.array(SearchResultSchema),
  usage: z.object({
    search_calls: z.number(),
    daily_limit: z.number(),
  }),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
}

/**
 * R1（无 include_domains）发给 Tavily / 官方网关的排除站点。
 * 有 include 时不要附带本列表：Tavily 以 include 为准，且 R2 需要放行社媒。
 * Tavily 按域名匹配（含 www / 子域），不能表达路径，也不能覆盖全部国别 TLD。
 */
export const TAVILY_EXCLUDE_DOMAINS: string[] = [
  "google.com",
  "google.co.uk",
  "google.de",
  "google.fr",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "amazon.com",
  "amazon.de",
  "amazon.co.uk",
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "tiktok.com",
];

/** 直连 Tavily 与官方网关共用：有 include 只传 include，否则传 exclude。不会两个都传。 */
export function buildSearchDomainFilters(includeDomains?: string[]): {
  include_domains?: string[];
  exclude_domains?: string[];
} {
  const include = prepareIncludeDomains(includeDomains).upstream;
  if (include.length) {
    return { include_domains: include };
  }
  return { exclude_domains: [...TAVILY_EXCLUDE_DOMAINS] };
}

export function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/** 校验并整理 include_domains；空结果视为未传。非法项抛错。 */
export function prepareIncludeDomains(raw?: string[]): {
  upstream: string[];
  cacheToken: string;
} {
  if (!raw?.length) {
    return { upstream: [], cacheToken: "none" };
  }

  const upstream: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    if (/\s/.test(trimmed) || !trimmed.includes(".")) {
      throw new Error(`invalid include_domains entry: ${trimmed}`);
    }
    if (trimmed.length > 200) {
      throw new Error(`invalid include_domains entry: too long`);
    }
    const key = trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "");
    if (seen.has(key)) continue;
    seen.add(key);
    upstream.push(trimmed);
  }

  if (!upstream.length) {
    return { upstream: [], cacheToken: "none" };
  }

  const cacheToken = [...seen].sort().join(",");
  return { upstream, cacheToken };
}

export function isPersonalProfileUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = stripWww(parsed.hostname.toLowerCase());
  const path = parsed.pathname.toLowerCase();

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (path === "/in" || path.startsWith("/in/") || path === "/pub" || path.startsWith("/pub/")) {
      return true;
    }
  }

  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    if (path === "/profile.php" || path.startsWith("/people/") || path.startsWith("/groups/")) {
      return true;
    }
  }

  return false;
}

export function matchesIncludeDomain(url: string, include: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const urlHost = stripWww(parsed.hostname.toLowerCase());
  const urlPath = parsed.pathname.toLowerCase() || "/";
  const entry = include.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const slash = entry.indexOf("/");
  const entryHost = slash === -1 ? entry : entry.slice(0, slash);
  const entryPath = slash === -1 ? "" : `/${entry.slice(slash + 1)}`.replace(/\/+$/, "");

  const hostOk = urlHost === entryHost || urlHost.endsWith(`.${entryHost}`);
  if (!hostOk) return false;
  if (!entryPath || entryPath === "/") return true;

  const prefix = entryPath.toLowerCase();
  return urlPath === prefix || urlPath.startsWith(`${prefix}/`);
}

/** 非法 URL 与个人主页路径仍在本地丢掉；站点收窄交给上游 include/exclude。 */
export function shouldExcludeUrl(url: string): boolean {
  const host = normalizeHost(url);
  if (!host) {
    return true;
  }
  return isPersonalProfileUrl(url);
}

export function mapTavilyResults(results: TavilySearchResult[]): SearchResult[] {
  const mapped: SearchResult[] = [];

  for (const item of results) {
    if (shouldExcludeUrl(item.url)) {
      continue;
    }
    mapped.push({
      title: item.title?.trim() || item.url,
      url: item.url,
      snippet: item.content?.trim() || "",
      position: mapped.length + 1,
    });
    if (mapped.length >= 10) {
      break;
    }
  }

  return mapped;
}

export function buildTavilySearchBody(
  query: string,
  numResults: number,
  apiKey: string,
  includeDomains?: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: "basic",
    max_results: Math.min(Math.max(numResults, 1), 10),
    include_answer: false,
    include_raw_content: false,
  };
  return {
    ...body,
    ...buildSearchDomainFilters(includeDomains),
  };
}

export async function searchTavily(
  query: string,
  numResults: number,
  apiKey: string,
  includeDomains?: string[],
): Promise<TavilySearchResponse> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTavilySearchBody(query, numResults, apiKey, includeDomains)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily API error ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as TavilySearchResponse;
  return payload;
}

export function getTavilyApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }
  return apiKey;
}

export function getSearchProvider(): string {
  return process.env.SEARCH_PROVIDER?.trim() || "tavily";
}
