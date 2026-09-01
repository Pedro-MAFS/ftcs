import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlaceDetailsResponse, PlaceSummary } from "./types.js";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface SearchCacheEntry {
  textQuery: string;
  languageCode: string;
  regionCode: string;
  pageSize: number;
  provider: string;
  cached_at: string;
  expires_at: string;
  places: PlaceSummary[];
}

export interface DetailsCacheEntry {
  placeId: string;
  languageCode: string;
  provider: string;
  cached_at: string;
  expires_at: string;
  displayName: string;
  formattedAddress: string;
  types: string[];
  websiteUri?: string;
}

function getSearchCacheDir(root: string): string {
  return join(root, "data", "cache", "places", "search");
}

function getDetailsCacheDir(root: string): string {
  return join(root, "data", "cache", "places", "details");
}

export function buildSearchCacheKey(
  textQuery: string,
  languageCode: string,
  regionCode: string,
  pageSize: number,
): string {
  const raw = `${textQuery}|${languageCode}|${regionCode}|${pageSize}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function buildDetailsCacheKey(placeId: string, languageCode: string): string {
  const raw = `${placeId}|${languageCode}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function readSearchCache(
  root: string,
  textQuery: string,
  languageCode: string,
  regionCode: string,
  pageSize: number,
): SearchCacheEntry | null {
  const key = buildSearchCacheKey(textQuery, languageCode, regionCode, pageSize);
  const cachePath = join(getSearchCacheDir(root), `${key}.json`);
  if (!existsSync(cachePath)) {
    return null;
  }

  const entry = JSON.parse(readFileSync(cachePath, "utf8")) as SearchCacheEntry;
  if (Date.now() > Date.parse(entry.expires_at)) {
    return null;
  }
  return entry;
}

export function writeSearchCache(
  root: string,
  textQuery: string,
  languageCode: string,
  regionCode: string,
  pageSize: number,
  provider: string,
  places: PlaceSummary[],
): SearchCacheEntry {
  const cacheDir = getSearchCacheDir(root);
  mkdirSync(cacheDir, { recursive: true });

  const now = Date.now();
  const entry: SearchCacheEntry = {
    textQuery,
    languageCode,
    regionCode,
    pageSize,
    provider,
    cached_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTL_MS).toISOString(),
    places,
  };

  const key = buildSearchCacheKey(textQuery, languageCode, regionCode, pageSize);
  writeFileSync(join(cacheDir, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return entry;
}

export function readDetailsCache(
  root: string,
  placeId: string,
  languageCode: string,
): DetailsCacheEntry | null {
  const key = buildDetailsCacheKey(placeId, languageCode);
  const cachePath = join(getDetailsCacheDir(root), `${key}.json`);
  if (!existsSync(cachePath)) {
    return null;
  }

  const entry = JSON.parse(readFileSync(cachePath, "utf8")) as DetailsCacheEntry;
  if (Date.now() > Date.parse(entry.expires_at)) {
    return null;
  }
  return entry;
}

export function writeDetailsCache(
  root: string,
  placeId: string,
  languageCode: string,
  provider: string,
  details: Omit<PlaceDetailsResponse, "provider" | "cached" | "placeId">,
): DetailsCacheEntry {
  const cacheDir = getDetailsCacheDir(root);
  mkdirSync(cacheDir, { recursive: true });

  const now = Date.now();
  const entry: DetailsCacheEntry = {
    placeId,
    languageCode,
    provider,
    cached_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTL_MS).toISOString(),
    displayName: details.displayName,
    formattedAddress: details.formattedAddress,
    types: details.types,
    websiteUri: details.websiteUri,
  };

  const key = buildDetailsCacheKey(placeId, languageCode);
  writeFileSync(join(cacheDir, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return entry;
}
