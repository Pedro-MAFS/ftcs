import { PLACE_DETAILS_FIELD_MASK, TEXT_SEARCH_FIELD_MASK } from "./field-masks.js";
import type { PlaceDetailsResponse, PlaceSummary } from "./types.js";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

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

export async function textSearchCustom(
  apiKey: string,
  textQuery: string,
  languageCode: string,
  regionCode: string | undefined,
  pageSize: number,
  fetchFn: FetchFn = fetch,
): Promise<PlaceSummary[]> {
  const body: Record<string, unknown> = {
    textQuery,
    languageCode,
    pageSize,
  };
  if (regionCode) {
    body.regionCode = regionCode;
  }

  const response = await fetchFn(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
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

  return mapTextSearchPlaces(json, languageCode);
}

export function buildPlaceDetailsUrl(placeId: string): string {
  const normalized = normalizePlaceId(placeId);
  return `https://places.googleapis.com/v1/places/${encodeURIComponent(normalized)}`;
}

export async function placeDetailsCustom(
  apiKey: string,
  placeId: string,
  languageCode: string,
  fetchFn: FetchFn = fetch,
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
