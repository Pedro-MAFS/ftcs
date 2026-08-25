import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCacheKey, readCache, writeCache } from "./cache.js";
import { mapTavilyResults, shouldExcludeUrl } from "./tavily.js";
import { assertCanSearch, incrementSearchUsage, getDailyUsage } from "./usage.js";

test("shouldExcludeUrl only drops invalid and personal-profile URLs", () => {
  assert.equal(shouldExcludeUrl("https://www.google.com/search?q=test"), false);
  assert.equal(shouldExcludeUrl("https://www.youtube.com/watch?v=1"), false);
  assert.equal(shouldExcludeUrl("https://abc-decking.de/products"), false);
  assert.equal(shouldExcludeUrl("https://www.linkedin.com/in/jane"), true);
});

test("mapTavilyResults maps valid results without dropping excluded hosts", () => {
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

  assert.equal(mapped.length, 2);
  assert.equal(mapped[0]?.url, "https://example-decking.de");
  assert.equal(mapped[1]?.url, "https://www.google.com/search?q=test");
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

test("cache key is unchanged without include_domains (R1 compatible)", () => {
  const baseline = buildCacheKey("WPC Decking importer Germany", "en", 5);
  assert.equal(buildCacheKey("WPC Decking importer Germany", "en", 5, undefined), baseline);
  assert.equal(buildCacheKey("WPC Decking importer Germany", "en", 5, []), baseline);
  assert.equal(buildCacheKey("WPC Decking importer Germany", "en", 5, ["", "  "]), baseline);
});

test("cache key changes when include_domains is set", () => {
  const none = buildCacheKey("q", "en", 5);
  const facebook = buildCacheKey("q", "en", 5, ["facebook.com"]);
  const linkedin = buildCacheKey("q", "en", 5, ["linkedin.com/company"]);
  assert.notEqual(none, facebook);
  assert.notEqual(facebook, linkedin);
  assert.equal(
    buildCacheKey("q", "en", 5, ["b.com", "a.com"]),
    buildCacheKey("q", "en", 5, ["a.com", "b.com"]),
  );
});

test("cache read/write with include_domains does not collide with R1 entry", () => {
  const root = mkdtempSync(join(tmpdir(), "ftcs-search-cache-include-"));
  try {
    mkdirSync(join(root, "data", "cache", "search"), { recursive: true });
    const r1 = [{ title: "Site", url: "https://example.com", snippet: "r1", position: 1 }];
    const r2 = [{ title: "FB", url: "https://facebook.com/acme", snippet: "r2", position: 1 }];

    writeCache(root, "q", "en", 5, "tavily", r1);
    writeCache(root, "q", "en", 5, "tavily", r2, ["facebook.com"]);

    const cachedR1 = readCache(root, "q", "en", 5);
    const cachedR2 = readCache(root, "q", "en", 5, ["facebook.com"]);
    assert.equal(cachedR1?.results[0]?.url, "https://example.com");
    assert.equal(cachedR2?.results[0]?.url, "https://facebook.com/acme");
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
