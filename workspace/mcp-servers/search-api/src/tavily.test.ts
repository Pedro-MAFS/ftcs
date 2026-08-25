import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchDomainFilters,
  buildTavilySearchBody,
  mapTavilyResults,
  prepareIncludeDomains,
  shouldExcludeUrl,
  TAVILY_EXCLUDE_DOMAINS,
} from "./tavily.js";

test("mapTavilyResults preserves order for valid urls", () => {
  const mapped = mapTavilyResults([
    { title: "A", url: "https://a.com", content: "a" },
    { title: "B", url: "https://b.com", content: "b" },
    { title: "C", url: "https://c.com", content: "c" },
  ]);

  assert.equal(mapped.length, 3);
  assert.deepEqual(
    mapped.map((item) => item.url),
    ["https://a.com", "https://b.com", "https://c.com"]
  );
});

test("shouldExcludeUrl no longer drops Facebook/Google locally (Tavily exclude does)", () => {
  assert.equal(shouldExcludeUrl("https://www.facebook.com/SomePage"), false);
  assert.equal(shouldExcludeUrl("https://www.google.com/search?q=test"), false);
  assert.equal(shouldExcludeUrl("https://abc-decking.de/products"), false);
});

test("Facebook personal/group paths stay excluded locally", () => {
  assert.equal(shouldExcludeUrl("https://www.facebook.com/profile.php?id=1"), true);
  assert.equal(shouldExcludeUrl("https://www.facebook.com/people/Jane-Doe/123"), true);
  assert.equal(shouldExcludeUrl("https://www.facebook.com/groups/importers"), true);
});

test("LinkedIn personal paths stay excluded locally", () => {
  assert.equal(shouldExcludeUrl("https://www.linkedin.com/in/jane-doe"), true);
  assert.equal(shouldExcludeUrl("https://www.linkedin.com/pub/jane-doe/1/2/3"), true);
  assert.equal(shouldExcludeUrl("https://www.linkedin.com/company/acme"), false);
});

test("mapTavilyResults drops personal pages but keeps off-site URLs for Tavily to have filtered", () => {
  const mapped = mapTavilyResults([
    { title: "In", url: "https://www.linkedin.com/in/foo", content: "person" },
    { title: "Co", url: "https://www.linkedin.com/company/acme", content: "company" },
    { title: "Wiki", url: "https://en.wikipedia.org/wiki/x", content: "wiki" },
  ]);

  assert.deepEqual(
    mapped.map((item) => item.url),
    [
      "https://www.linkedin.com/company/acme",
      "https://en.wikipedia.org/wiki/x",
    ],
  );
});

test("prepareIncludeDomains treats empty as none and rejects illegal entries", () => {
  assert.deepEqual(prepareIncludeDomains(undefined), { upstream: [], cacheToken: "none" });
  assert.deepEqual(prepareIncludeDomains([]), { upstream: [], cacheToken: "none" });
  assert.deepEqual(prepareIncludeDomains(["", "  "]), { upstream: [], cacheToken: "none" });
  assert.throws(() => prepareIncludeDomains(["notadomain"]), /invalid include_domains/);
  assert.throws(() => prepareIncludeDomains(["foo bar.com"]), /invalid include_domains/);
});

test("buildSearchDomainFilters sends exclude on R1 and include on R2, never both", () => {
  const r1 = buildSearchDomainFilters();
  assert.deepEqual(r1.exclude_domains, TAVILY_EXCLUDE_DOMAINS);
  assert.equal("include_domains" in r1, false);

  const r2 = buildSearchDomainFilters(["linkedin.com/company"]);
  assert.deepEqual(r2.include_domains, ["linkedin.com/company"]);
  assert.equal("exclude_domains" in r2, false);
});

test("buildTavilySearchBody omits include_domains when empty and sends exclude (A6)", () => {
  const none = buildTavilySearchBody("q", 5, "key");
  assert.equal("include_domains" in none, false);
  assert.deepEqual(none.exclude_domains, TAVILY_EXCLUDE_DOMAINS);

  const empty = buildTavilySearchBody("q", 5, "key", ["", "  "]);
  assert.equal("include_domains" in empty, false);
  assert.deepEqual(empty.exclude_domains, TAVILY_EXCLUDE_DOMAINS);

  const withInclude = buildTavilySearchBody("q", 5, "key", ["linkedin.com/company"]);
  assert.deepEqual(withInclude.include_domains, ["linkedin.com/company"]);
  assert.equal("exclude_domains" in withInclude, false);
});
