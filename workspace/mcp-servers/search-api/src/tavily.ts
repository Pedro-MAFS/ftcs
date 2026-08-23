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

const EXCLUDED_HOST_PATTERNS = [
  /^www\.google\./,
  /^google\./,
  /^www\.youtube\.com$/,
  /^youtube\.com$/,
  /^www\.facebook\.com$/,
  /^facebook\.com$/,
  /^www\.instagram\.com$/,
  /^www\.twitter\.com$/,
  /^x\.com$/,
  /^www\.pinterest\.com$/,
  /^www\.wikipedia\.org$/,
  /^en\.wikipedia\.org$/,
  /^www\.reddit\.com$/,
  /^www\.quora\.com$/,
  /^www\.amazon\./,
  /^www\.ebay\./,
  /^www\.tiktok\.com$/,
];

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

export function shouldExcludeUrl(url: string, includeDomains?: string[]): boolean {
  const host = normalizeHost(url);
  if (!host) {
    return true;
  }
  if (isPersonalProfileUrl(url)) {
    return true;
  }

  const prepared = prepareIncludeDomains(includeDomains);
  if (prepared.upstream.length) {
    return !prepared.upstream.some((entry) => matchesIncludeDomain(url, entry));
  }

  return EXCLUDED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function mapTavilyResults(
  results: TavilySearchResult[],
  includeDomains?: string[],
): SearchResult[] {
  const include = prepareIncludeDomains(includeDomains).upstream;
  const includeArg = include.length ? include : undefined;
  const mapped: SearchResult[] = [];

  for (const item of results) {
    if (shouldExcludeUrl(item.url, includeArg)) {
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
  const prepared = prepareIncludeDomains(includeDomains);
  if (prepared.upstream.length) {
    body.include_domains = prepared.upstream;
  }
  return body;
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
