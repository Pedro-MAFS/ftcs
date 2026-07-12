import test from "node:test";
import assert from "node:assert/strict";
import { mapTavilyResults } from "./tavily.js";

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
