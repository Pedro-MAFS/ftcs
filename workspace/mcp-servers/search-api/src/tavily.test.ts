import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTavilySearchBody,
  mapTavilyResults,
  prepareIncludeDomains,
  shouldExcludeUrl,
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

test("Facebook is excluded without include_domains (R1)", () => {
  assert.equal(shouldExcludeUrl("https://www.facebook.com/SomePage"), true);
  assert.equal(shouldExcludeUrl("https://facebook.com/SomePage"), true);
});

test("Facebook public page is kept when include_domains matches", () => {
  assert.equal(
    shouldExcludeUrl("https://www.facebook.com/SomeCompany", ["facebook.com"]),
    false,
  );
});

test("Facebook personal/group paths stay excluded even with include", () => {
  assert.equal(
    shouldExcludeUrl("https://www.facebook.com/profile.php?id=1", ["facebook.com"]),
    true,
  );
  assert.equal(
    shouldExcludeUrl("https://www.facebook.com/people/Jane-Doe/123", ["facebook.com"]),
    true,
  );
  assert.equal(
    shouldExcludeUrl("https://www.facebook.com/groups/importers", ["facebook.com"]),
    true,
  );
});

test("LinkedIn personal paths stay excluded even with include", () => {
  assert.equal(
    shouldExcludeUrl("https://www.linkedin.com/in/jane-doe", ["linkedin.com"]),
    true,
  );
  assert.equal(
    shouldExcludeUrl("https://www.linkedin.com/pub/jane-doe/1/2/3", ["linkedin.com/company"]),
    true,
  );
});

test("LinkedIn company path is kept when include has path prefix", () => {
  assert.equal(
    shouldExcludeUrl("https://www.linkedin.com/company/acme", ["linkedin.com/company"]),
    false,
  );
  assert.equal(
    shouldExcludeUrl("https://example.com/", ["linkedin.com/company"]),
    true,
  );
});

test("mapTavilyResults with include keeps company URL and drops personal/off-site", () => {
  const mapped = mapTavilyResults(
    [
      { title: "In", url: "https://www.linkedin.com/in/foo", content: "person" },
      { title: "Co", url: "https://www.linkedin.com/company/acme", content: "company" },
      { title: "Wiki", url: "https://en.wikipedia.org/wiki/x", content: "wiki" },
    ],
    ["linkedin.com/company"],
  );

  assert.deepEqual(
    mapped.map((item) => item.url),
    ["https://www.linkedin.com/company/acme"],
  );
  assert.equal(mapped[0]?.position, 1);
});

test("prepareIncludeDomains treats empty as none and rejects illegal entries", () => {
  assert.deepEqual(prepareIncludeDomains(undefined), { upstream: [], cacheToken: "none" });
  assert.deepEqual(prepareIncludeDomains([]), { upstream: [], cacheToken: "none" });
  assert.deepEqual(prepareIncludeDomains(["", "  "]), { upstream: [], cacheToken: "none" });
  assert.throws(() => prepareIncludeDomains(["notadomain"]), /invalid include_domains/);
  assert.throws(() => prepareIncludeDomains(["foo bar.com"]), /invalid include_domains/);
});

test("buildTavilySearchBody omits include_domains when empty (A6)", () => {
  const none = buildTavilySearchBody("q", 5, "key");
  assert.equal("include_domains" in none, false);

  const empty = buildTavilySearchBody("q", 5, "key", ["", "  "]);
  assert.equal("include_domains" in empty, false);

  const withInclude = buildTavilySearchBody("q", 5, "key", ["linkedin.com/company"]);
  assert.deepEqual(withInclude.include_domains, ["linkedin.com/company"]);
});
