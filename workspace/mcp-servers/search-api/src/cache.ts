import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot } from "./paths.js";
import { prepareIncludeDomains } from "./tavily.js";

export interface SearchCacheEntry {
  query: string;
  language: string;
  num_results: number;
  provider: string;
  cached_at: string;
  expires_at: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    position: number;
  }>;
}

const TTL_MS = 24 * 60 * 60 * 1000;

export function getCacheDir(root: string): string {
  return join(root, "data", "cache", "search");
}

export function buildCacheKey(
  query: string,
  language: string,
  numResults: number,
  includeDomains?: string[],
): string {
  const token = prepareIncludeDomains(includeDomains).cacheToken;
  const raw =
    token === "none"
      ? `${query}|${language}|${numResults}`
      : `${query}|${language}|${numResults}|${token}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function readCache(
  root: string,
  query: string,
  language: string,
  numResults: number,
  includeDomains?: string[],
): SearchCacheEntry | null {
  const cacheDir = getCacheDir(root);
  const key = buildCacheKey(query, language, numResults, includeDomains);
  const cachePath = join(cacheDir, `${key}.json`);

  if (!existsSync(cachePath)) {
    return null;
  }

  const entry = JSON.parse(readFileSync(cachePath, "utf8")) as SearchCacheEntry;
  if (Date.now() > Date.parse(entry.expires_at)) {
    return null;
  }

  return entry;
}

export function writeCache(
  root: string,
  query: string,
  language: string,
  numResults: number,
  provider: string,
  results: SearchCacheEntry["results"],
  includeDomains?: string[],
): SearchCacheEntry {
  const cacheDir = getCacheDir(root);
  mkdirSync(cacheDir, { recursive: true });

  const now = Date.now();
  const entry: SearchCacheEntry = {
    query,
    language,
    num_results: numResults,
    provider,
    cached_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTL_MS).toISOString(),
    results,
  };

  const key = buildCacheKey(query, language, numResults, includeDomains);
  const cachePath = join(cacheDir, `${key}.json`);
  writeFileSync(cachePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return entry;
}

export function getProjectRootForCache(): string {
  return findProjectRoot();
}
