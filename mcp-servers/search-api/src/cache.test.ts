import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCacheKey, readCache, writeCache } from "./cache.js";
import { mapTavilyResults, shouldExcludeUrl } from "./tavily.js";
import { assertCanSearch, incrementSearchUsage, getDailyUsage } from "./usage.js";

test("shouldExcludeUrl filters common non-company hosts", () => {
  assert.equal(shouldExcludeUrl("https://www.google.com/search?q=test"), true);
  assert.equal(shouldExcludeUrl("https://www.youtube.com/watch?v=1"), true);
  assert.equal(shouldExcludeUrl("https://abc-decking.de/products"), false);
});

test("mapTavilyResults maps and filters results", () => {
  const mapped = mapTavilyResults([
    {
      title: "Good Lead",
      url: "https://example-decking.de",
      content: "WPC decking distributor in Germany",
    },
    {
      title: "Google",
      url: "https://www.google.com/search?q=test",
      content: "search",
    },
  ]);

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]?.url, "https://example-decking.de");
  assert.equal(mapped[0]?.position, 1);
});

test("cache read/write roundtrip", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-search-cache-"));
  try {
    mkdirSync(join(root, "data", "cache", "search"), { recursive: true });
    const results = [
      {
        title: "Example",
        url: "https://example.com",
        snippet: "snippet",
        position: 1,
      },
    ];

    writeCache(root, "WPC Decking importer Germany", "en", 5, "tavily", results);
    const key = buildCacheKey("WPC Decking importer Germany", "en", 5);
    assert.ok(key.length > 10);

    const cached = readCache(root, "WPC Decking importer Germany", "en", 5);
    assert.ok(cached);
    assert.equal(cached?.results.length, 1);
    assert.equal(cached?.provider, "tavily");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("daily usage increments and enforces limit", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-search-usage-"));
  try {
    mkdirSync(join(root, "data", "cache", "search"), { recursive: true });
    process.env.SEARCH_DAILY_LIMIT = "2";

    incrementSearchUsage(root);
    incrementSearchUsage(root);
    const usage = getDailyUsage(root);
    assert.equal(usage.search_calls, 2);

    assert.throws(() => assertCanSearch(root), /daily limit/i);
  } finally {
    delete process.env.SEARCH_DAILY_LIMIT;
    rmSync(root, { recursive: true, force: true });
  }
});
