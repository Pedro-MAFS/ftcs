import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceDetailsUrl,
  mapPlaceDetails,
  mapTextSearchPlaces,
  normalizePlaceId,
  PLACE_DETAILS_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_PAGINATED_FIELD_MASK,
  textSearchCustom,
  textSearchUpTo,
  placeDetailsCustom,
  PlacesHttpError,
} from "./custom.js";
import { textSearchPageSizeSchema } from "./types.js";

test("TEXT_SEARCH_FIELD_MASK excludes websiteUri", () => {
  assert.equal(TEXT_SEARCH_FIELD_MASK.includes("websiteUri"), false);
  assert.ok(TEXT_SEARCH_FIELD_MASK.includes("places.id"));
});

test("PLACE_DETAILS_FIELD_MASK includes websiteUri", () => {
  assert.ok(PLACE_DETAILS_FIELD_MASK.includes("websiteUri"));
  assert.equal(PLACE_DETAILS_FIELD_MASK.includes("places."), false);
});

test("normalizePlaceId strips places/ prefix", () => {
  assert.equal(normalizePlaceId("places/ChIJabc"), "ChIJabc");
  assert.equal(normalizePlaceId("ChIJabc"), "ChIJabc");
});

test("mapTextSearchPlaces parses displayName.text and normalizes id", () => {
  const places = mapTextSearchPlaces(
    {
      places: [
        {
          id: "places/ChIJtest",
          displayName: { text: "Example GmbH", languageCode: "de" },
          formattedAddress: "München, Germany",
          types: ["store", "point_of_interest"],
          businessStatus: "OPERATIONAL",
        },
      ],
    },
    "de",
  );

  assert.equal(places.length, 1);
  assert.equal(places[0]?.placeId, "ChIJtest");
  assert.equal(places[0]?.displayName, "Example GmbH");
  assert.deepEqual(places[0]?.types, ["store", "point_of_interest"]);
});

test("mapPlaceDetails handles missing websiteUri", () => {
  const details = mapPlaceDetails(
    {
      id: "places/ChIJx",
      displayName: { text: "Shop" },
      formattedAddress: "Addr",
      types: ["store"],
    },
    "ChIJx",
    "en",
  );

  assert.equal(details.placeId, "ChIJx");
  assert.equal(details.displayName, "Shop");
  assert.equal(details.websiteUri, undefined);
});

test("buildPlaceDetailsUrl encodes place id", () => {
  assert.equal(
    buildPlaceDetailsUrl("places/ChIJ+test"),
    "https://places.googleapis.com/v1/places/ChIJ%2Btest",
  );
});

test("textSearchCustom sends FieldMask header and maps 401", async () => {
  let capturedHeaders: HeadersInit | undefined;
  const mockFetch: typeof fetch = async (_url, init) => {
    capturedHeaders = init?.headers;
    return new Response(JSON.stringify({ error: { message: "invalid key" } }), {
      status: 401,
    });
  };

  await assert.rejects(
    () => textSearchCustom("secret-key", "query", "en", "DE", 20, mockFetch),
    (error: unknown) => {
      assert.ok(error instanceof PlacesHttpError);
      assert.equal(error.httpStatus, 401);
      return true;
    },
  );

  const headers = capturedHeaders as Record<string, string>;
  assert.equal(headers["X-Goog-FieldMask"], TEXT_SEARCH_FIELD_MASK);
  assert.equal(headers["X-Goog-Api-Key"], "secret-key");
});

test("placeDetailsCustom uses GET with details FieldMask", async () => {
  let method = "";
  let url = "";
  let fieldMask = "";
  const mockFetch: typeof fetch = async (input, init) => {
    url = String(input);
    method = init?.method || "GET";
    fieldMask = (init?.headers as Record<string, string>)["X-Goog-FieldMask"];
    return new Response(
      JSON.stringify({
        id: "places/ChIJok",
        displayName: { text: "Co" },
        formattedAddress: "A",
        types: ["store"],
        websiteUri: "https://example.com/",
      }),
      { status: 200 },
    );
  };

  const details = await placeDetailsCustom("key", "ChIJok", "de", mockFetch);
  assert.equal(method, "GET");
  assert.ok(url.includes("/places/ChIJok"));
  assert.equal(fieldMask, PLACE_DETAILS_FIELD_MASK);
  assert.equal(details.websiteUri, "https://example.com/");
});

interface CapturedSearch {
  body: Record<string, unknown>;
  fieldMask: string;
}

function placePayload(id: string) {
  return {
    id: `places/${id}`,
    displayName: { text: id },
    formattedAddress: "Addr",
    types: ["store"],
  };
}

function placesPage(ids: string[], nextPageToken?: string) {
  return {
    places: ids.map(placePayload),
    ...(nextPageToken ? { nextPageToken } : {}),
  };
}

function mockSearch(pages: Array<{ status: number; json: unknown }>): {
  fetchFn: typeof fetch;
  calls: CapturedSearch[];
} {
  const calls: CapturedSearch[] = [];
  const fetchFn: typeof fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    calls.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      fieldMask: headers["X-Goog-FieldMask"],
    });
    const page = pages[calls.length - 1];
    if (!page) {
      throw new Error("unexpected extra page request");
    }
    return new Response(JSON.stringify(page.json), { status: page.status });
  };
  return { fetchFn, calls };
}

test("textSearchUpTo pageSize 20 is a single request without nextPageToken mask", async () => {
  const ids = Array.from({ length: 20 }, (_, index) => `p${index + 1}`);
  const { fetchFn, calls } = mockSearch([{ status: 200, json: placesPage(ids, "should-not-matter") }]);

  const places = await textSearchUpTo("key", "flooring", "de", "DE", 20, fetchFn);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.pageSize, 20);
  assert.equal(calls[0]?.body.pageToken, undefined);
  assert.equal(calls[0]?.body.textQuery, "flooring");
  assert.equal(calls[0]?.fieldMask, TEXT_SEARCH_FIELD_MASK);
  assert.equal(places.length, 20);
  assert.equal(JSON.stringify(places).includes("nextPageToken"), false);
});

test("textSearchUpTo pageSize 10 sends that page size once", async () => {
  const { fetchFn, calls } = mockSearch([{ status: 200, json: placesPage(["only"]) }]);

  const places = await textSearchUpTo("key", "q", "en", undefined, 10, fetchFn);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.pageSize, 10);
  assert.equal(calls[0]?.body.pageToken, undefined);
  assert.equal(calls[0]?.fieldMask, TEXT_SEARCH_FIELD_MASK);
  assert.equal(places.length, 1);
});

test("textSearchUpTo pageSize 40 merges two pages and hides the token", async () => {
  const page1 = Array.from({ length: 20 }, (_, index) => `a${index + 1}`);
  const page2 = Array.from({ length: 20 }, (_, index) => `b${index + 1}`);
  const { fetchFn, calls } = mockSearch([
    { status: 200, json: placesPage(page1, "token-2") },
    { status: 200, json: placesPage(page2, "token-3") },
  ]);

  const places = await textSearchUpTo("key", "flooring", "de", "DE", 40, fetchFn);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.body.pageSize, 20);
  assert.equal(calls[0]?.body.pageToken, undefined);
  assert.equal(calls[1]?.body.pageSize, 20);
  assert.equal(calls[1]?.body.pageToken, "token-2");
  assert.equal(calls[1]?.body.textQuery, "flooring");
  assert.equal(calls[1]?.body.languageCode, "de");
  assert.equal(calls[1]?.body.regionCode, "DE");
  for (const call of calls) {
    assert.equal(call.fieldMask, TEXT_SEARCH_PAGINATED_FIELD_MASK);
    assert.equal(call.fieldMask.includes("nextPageToken"), true);
    assert.equal(call.fieldMask.includes("websiteUri"), false);
  }
  assert.equal(places.length, 40);
  assert.equal(places[0]?.placeId, "a1");
  assert.equal(places[20]?.placeId, "b1");
  assert.equal(JSON.stringify(places).includes("token-"), false);
});

test("textSearchUpTo returns a short first page when Google has no next token", async () => {
  const ids = Array.from({ length: 20 }, (_, index) => `s${index + 1}`);
  const { fetchFn, calls } = mockSearch([{ status: 200, json: placesPage(ids) }]);

  const places = await textSearchUpTo("key", "q", "en", "US", 40, fetchFn);

  assert.equal(calls.length, 1);
  assert.equal(places.length, 20);
});

test("textSearchUpTo fails the whole call when a later page is HTTP 500", async () => {
  const ids = Array.from({ length: 20 }, (_, index) => `e${index + 1}`);
  const { fetchFn } = mockSearch([
    { status: 200, json: placesPage(ids, "token-2") },
    { status: 500, json: { error: { message: "backend" } } },
  ]);

  await assert.rejects(
    () => textSearchUpTo("key", "q", "en", "US", 40, fetchFn),
    (error: unknown) => {
      assert.ok(error instanceof PlacesHttpError);
      assert.equal(error.httpStatus, 500);
      return true;
    },
  );
});

test("textSearchUpTo asks the last page only for the remaining count", async () => {
  const page1 = Array.from({ length: 20 }, (_, index) => `m${index + 1}`);
  const page2 = Array.from({ length: 10 }, (_, index) => `n${index + 1}`);
  const { fetchFn, calls } = mockSearch([
    { status: 200, json: placesPage(page1, "token-2") },
    { status: 200, json: placesPage(page2) },
  ]);

  const places = await textSearchUpTo("key", "q", "en", "DE", 30, fetchFn);

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.body.pageSize, 10);
  assert.equal(places.length, 30);
});

test("textSearchUpTo skips duplicate place ids and continues while a token remains", async () => {
  const page1 = Array.from({ length: 20 }, (_, index) => `d${index + 1}`);
  const { fetchFn, calls } = mockSearch([
    { status: 200, json: placesPage(page1, "token-2") },
    { status: 200, json: placesPage(["d1", "d2"], "token-3") },
    { status: 200, json: placesPage(["d21", "d22"]) },
  ]);

  const places = await textSearchUpTo("key", "q", "en", "DE", 22, fetchFn);

  assert.equal(calls.length, 3);
  assert.equal(calls[1]?.body.pageSize, 2);
  assert.equal(calls[1]?.body.pageToken, "token-2");
  assert.equal(calls[2]?.body.pageSize, 2);
  assert.equal(calls[2]?.body.pageToken, "token-3");
  assert.deepEqual(
    places.map((place) => place.placeId),
    [...page1, "d21", "d22"],
  );
});

test("textSearchPageSizeSchema rejects 61 and keeps the default at 20", () => {
  assert.equal(textSearchPageSizeSchema.safeParse(61).success, false);
  assert.equal(textSearchPageSizeSchema.safeParse(0).success, false);
  assert.equal(textSearchPageSizeSchema.safeParse(20.5).success, false);
  assert.equal(textSearchPageSizeSchema.safeParse(60).success, true);
  assert.equal(textSearchPageSizeSchema.parse(undefined), 20);
});
