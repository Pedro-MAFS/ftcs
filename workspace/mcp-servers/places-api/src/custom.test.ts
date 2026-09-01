import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceDetailsUrl,
  mapPlaceDetails,
  mapTextSearchPlaces,
  normalizePlaceId,
  PLACE_DETAILS_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
  textSearchCustom,
  placeDetailsCustom,
  PlacesHttpError,
} from "./custom.js";

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
