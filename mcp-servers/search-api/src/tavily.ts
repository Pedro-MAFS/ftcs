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

export function shouldExcludeUrl(url: string): boolean {
  const host = normalizeHost(url);
  if (!host) {
    return true;
  }
  return EXCLUDED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function mapTavilyResults(results: TavilySearchResult[]): SearchResult[] {
  const mapped: SearchResult[] = [];

  for (const [index, item] of results.entries()) {
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
    void index;
  }

  return mapped;
}

export async function searchTavily(
  query: string,
  numResults: number,
  apiKey: string
): Promise<TavilySearchResponse> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: Math.min(Math.max(numResults, 1), 10),
      include_answer: false,
      include_raw_content: false,
    }),
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
