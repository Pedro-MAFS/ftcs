import { PLACE_DETAILS_FIELD_MASK, TEXT_SEARCH_FIELD_MASK } from "./field-masks.js";
import { getPlacesFetch } from "./fetch.js";
import type { PlaceDetailsResponse, PlaceSummary } from "./types.js";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** Google 单次 Text Search 最多返回的条数。 */
export const TEXT_SEARCH_GOOGLE_PAGE_MAX = 20;

/** 60 条上限对应的最多请求次数。 */
export const TEXT_SEARCH_MAX_PAGES = 3;

/** 需要翻页时在现网掩码后追加，否则上游不返回 nextPageToken。 */
export const TEXT_SEARCH_PAGINATED_FIELD_MASK = `${TEXT_SEARCH_FIELD_MASK},nextPageToken`;

export class PlacesHttpError extends Error {
  readonly httpStatus: number;

  constructor(httpStatus: number, message: string) {
    super(message);
    this.name = "PlacesHttpError";
    this.httpStatus = httpStatus;
  }
}

export class PlacesResponseInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesResponseInvalidError";
  }
}

type FetchFn = typeof globalThis.fetch;

function normalizePlaceId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("places/")) {
    return trimmed.slice("places/".length);
  }
  return trimmed;
}

function parseDisplayName(
  value: unknown,
  languageCode?: string,
): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (languageCode && typeof record[languageCode] === "string") {
    return record[languageCode] as string;
  }
  return "";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function mapTextSearchPlaces(raw: unknown, languageCode: string): PlaceSummary[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const places = (raw as { places?: unknown }).places;
  if (!Array.isArray(places)) {
    return [];
  }

  const mapped: PlaceSummary[] = [];
  for (const item of places) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? normalizePlaceId(record.id) : "";
    if (!id) continue;

    mapped.push({
      placeId: id,
      displayName: parseDisplayName(record.displayName, languageCode),
      formattedAddress:
        typeof record.formattedAddress === "string" ? record.formattedAddress : "",
      types: parseStringArray(record.types),
      businessStatus:
        typeof record.businessStatus === "string" ? record.businessStatus : undefined,
    });
  }
  return mapped;
}

export function mapPlaceDetails(
  raw: unknown,
  placeId: string,
  languageCode: string,
): PlaceDetailsResponse {
  if (!raw || typeof raw !== "object") {
    throw new PlacesResponseInvalidError("Place Details 响应为空");
  }
  const record = raw as Record<string, unknown>;
  const id =
    typeof record.id === "string" ? normalizePlaceId(record.id) : normalizePlaceId(placeId);

  const websiteUri =
    typeof record.websiteUri === "string" && record.websiteUri.trim()
      ? record.websiteUri.trim()
      : undefined;

  return {
    provider: "custom",
    cached: false,
    placeId: id,
    displayName: parseDisplayName(record.displayName, languageCode),
    formattedAddress:
      typeof record.formattedAddress === "string" ? record.formattedAddress : "",
    types: parseStringArray(record.types),
    websiteUri,
  };
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function readNextPageToken(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const token = (raw as { nextPageToken?: unknown }).nextPageToken;
  if (typeof token !== "string") {
    return undefined;
  }
  const trimmed = token.trim();
  return trimmed || undefined;
}

interface TextSearchPage {
  places: PlaceSummary[];
  nextPageToken?: string;
}

async function fetchTextSearchPage(
  apiKey: string,
  textQuery: string,
  languageCode: string,
  regionCode: string | undefined,
  pageSize: number,
  fieldMask: string,
  pageToken: string | undefined,
  fetchFn: FetchFn,
): Promise<TextSearchPage> {
  const body: Record<string, unknown> = {
    textQuery,
    languageCode,
    pageSize,
  };
  if (regionCode) {
    body.regionCode = regionCode;
  }
  if (pageToken) {
    body.pageToken = pageToken;
  }

  const response = await fetchFn(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await readResponseBody(response);
    const suffix = detail ? `: ${detail.slice(0, 200)}` : "";
    throw new PlacesHttpError(
      response.status,
      `Google Places Text Search HTTP ${response.status}${suffix}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new PlacesResponseInvalidError("Text Search 响应不是合法 JSON");
  }

  return {
    places: mapTextSearchPlaces(json, languageCode),
    nextPageToken: readNextPageToken(json),
  };
}

export async function textSearchCustom(
  apiKey: string,
  textQuery: string,
  languageCode: string,
  regionCode: string | undefined,
  pageSize: number,
  fetchFn: FetchFn = getPlacesFetch(),
): Promise<PlaceSummary[]> {
  const page = await fetchTextSearchPage(
    apiKey,
    textQuery,
    languageCode,
    regionCode,
    pageSize,
    TEXT_SEARCH_FIELD_MASK,
    undefined,
    fetchFn,
  );
  return page.places;
}

/**
 * 按调用方希望的条数取地点。≤20 一次请求；>20 时内部翻页、按 placeId 去重后截断。
 * 某一页失败则整次抛出，不返回已合并的前几页。
 */
export async function textSearchUpTo(
  apiKey: string,
  textQuery: string,
  languageCode: string,
  regionCode: string | undefined,
  requested: number,
  fetchFn: FetchFn = getPlacesFetch(),
): Promise<PlaceSummary[]> {
  if (requested <= TEXT_SEARCH_GOOGLE_PAGE_MAX) {
    return textSearchCustom(
      apiKey,
      textQuery,
      languageCode,
      regionCode,
      requested,
      fetchFn,
    );
  }

  const collected: PlaceSummary[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (
    let pageIndex = 0;
    pageIndex < TEXT_SEARCH_MAX_PAGES && collected.length < requested;
    pageIndex++
  ) {
    const googlePageSize = Math.min(
      TEXT_SEARCH_GOOGLE_PAGE_MAX,
      requested - collected.length,
    );
    const page = await fetchTextSearchPage(
      apiKey,
      textQuery,
      languageCode,
      regionCode,
      googlePageSize,
      TEXT_SEARCH_PAGINATED_FIELD_MASK,
      pageToken,
      fetchFn,
    );

    if (page.places.length === 0) {
      break;
    }

    for (const place of page.places) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      collected.push(place);
      if (collected.length >= requested) break;
    }

    if (collected.length >= requested || !page.nextPageToken) {
      break;
    }
    pageToken = page.nextPageToken;
  }

  return collected.slice(0, requested);
}

export function buildPlaceDetailsUrl(placeId: string): string {
  const normalized = normalizePlaceId(placeId);
  return `https://places.googleapis.com/v1/places/${encodeURIComponent(normalized)}`;
}

export async function placeDetailsCustom(
  apiKey: string,
  placeId: string,
  languageCode: string,
  fetchFn: FetchFn = getPlacesFetch(),
): Promise<PlaceDetailsResponse> {
  const url = buildPlaceDetailsUrl(placeId);
  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const detail = await readResponseBody(response);
    const suffix = detail ? `: ${detail.slice(0, 200)}` : "";
    throw new PlacesHttpError(
      response.status,
      `Google Places Details HTTP ${response.status}${suffix}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new PlacesResponseInvalidError("Place Details 响应不是合法 JSON");
  }

  return mapPlaceDetails(json, placeId, languageCode);
}

export { TEXT_SEARCH_FIELD_MASK, PLACE_DETAILS_FIELD_MASK, normalizePlaceId };
