import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDetailsCacheKey,
  buildSearchCacheKey,
  readDetailsCache,
  readSearchCache,
  writeDetailsCache,
  writeSearchCache,
} from "./cache.js";

test("search cache key includes regionCode and pageSize", () => {
  const a = buildSearchCacheKey("q", "en", "DE", 20);
  const b = buildSearchCacheKey("q", "en", "", 20);
  const c = buildSearchCacheKey("q", "en", "DE", 10);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("search cache read/write roundtrip", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-places-search-cache-"));
  try {
    mkdirSync(join(root, "data", "cache", "places", "search"), { recursive: true });
    const places = [
      {
        placeId: "ChIJ1",
        displayName: "Shop",
        formattedAddress: "Addr",
        types: ["store"],
      },
    ];

    writeSearchCache(root, "München flooring", "de", "DE", 20, "custom", places);
    const cached = readSearchCache(root, "München flooring", "de", "DE", 20);
    assert.ok(cached);
    assert.equal(cached?.places[0]?.placeId, "ChIJ1");
    assert.equal(cached?.provider, "custom");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("details cache read/write roundtrip", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-places-details-cache-"));
  try {
    mkdirSync(join(root, "data", "cache", "places", "details"), { recursive: true });
    writeDetailsCache(root, "ChIJ1", "de", "custom", {
      displayName: "Shop",
      formattedAddress: "Addr",
      types: ["store"],
      websiteUri: "https://example.com/",
    });

    const key = buildDetailsCacheKey("ChIJ1", "de");
    assert.ok(key.length > 10);

    const cached = readDetailsCache(root, "ChIJ1", "de");
    assert.ok(cached);
    assert.equal(cached?.websiteUri, "https://example.com/");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("search cache miss when pageSize differs", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-places-search-miss-"));
  try {
    mkdirSync(join(root, "data", "cache", "places", "search"), { recursive: true });
    writeSearchCache(root, "q", "en", "US", 20, "custom", [
      {
        placeId: "x",
        displayName: "X",
        formattedAddress: "A",
        types: [],
      },
    ]);
    assert.equal(readSearchCache(root, "q", "en", "US", 10), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
