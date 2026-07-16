import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expandKeywords, assertProfileReadyForExpansion } from "./keyword-expander.js";
import type { ProductProfile } from "./profile-types.js";
import { ProductProfileSchema } from "./profile-types.js";
import { expandAndSaveKeywords, loadKeywords } from "./storage.js";
import { findProjectRoot } from "./paths.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function loadFixtureProfile(): ProductProfile {
  const root = findProjectRoot(join(MODULE_DIR, ".."));
  const raw = JSON.parse(
    readFileSync(join(root, "data", "products", "prod_20260712_001", "profile.json"), "utf8")
  );
  return ProductProfileSchema.parse(raw);
}

test("expandKeywords generates at least 30 queries across 4+ dimensions", () => {
  const profile = loadFixtureProfile();
  const expansion = expandKeywords(profile);

  assert.equal(expansion.product_id, profile.id);
  assert.ok(expansion.search_queries.length >= 30);
  assert.ok(expansion.search_queries.length <= 50);

  const dimensions = new Set(expansion.search_queries.map((query) => query.dimension));
  assert.ok(dimensions.size >= 4);
  assert.ok(dimensions.has("product"));

  const rounds = expansion.stats.by_round;
  assert.ok((rounds.R1 ?? 0) > 0);
  assert.ok((rounds.R2 ?? 0) > 0);
  assert.ok((rounds.R3 ?? 0) > 0);
  assert.ok((rounds.R4 ?? 0) > 0);
});

test("expandKeywords assigns unique query ids", () => {
  const profile = loadFixtureProfile();
  const expansion = expandKeywords(profile);
  const ids = expansion.search_queries.map((query) => query.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("assertProfileReadyForExpansion blocks draft profiles", () => {
  const profile = loadFixtureProfile();
  const draft = { ...profile, status: "draft" as const };
  assert.ok(assertProfileReadyForExpansion(draft));
  assert.equal(assertProfileReadyForExpansion(profile), null);
});

test("expandAndSaveKeywords persists expansion.json", () => {
  const root = findProjectRoot(join(MODULE_DIR, ".."));
  const productId = "prod_20260712_001";

  const result = expandAndSaveKeywords(root, productId);
  assert.equal(result.expansion.product_id, productId);
  assert.ok(result.expansion.search_queries.length >= 30);

  const loaded = loadKeywords(root, productId);
  assert.ok(loaded);
  assert.equal(loaded?.stats.total_queries, result.expansion.stats.total_queries);
});
