import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveProfile, loadProfile, saveKeywords, loadKeywords } from "./storage.js";

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ftcs-test-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(
    join(dir, "config", "scoring-rules.yaml"),
    "profile_readiness_threshold: 60\n",
    "utf8"
  );
  mkdirSync(join(dir, "data", "products"), { recursive: true });
  return dir;
}

test("saveProfile creates and updates product profile", () => {
  const root = createTempProject();

  try {
    const first = saveProfile(
      root,
      {
        company: { name: "ACME Valves", website: "https://acme.test" },
        products: [{ name: "Ball Valve", use_cases: ["water treatment"] }],
        buyer_personas: [{ role: "procurement_manager", company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
        source_inputs: [{ type: "file", path: "inputs/intro.txt" }],
      },
      "prod_test_001"
    );

    assert.equal(first.created, true);
    assert.equal(first.profile.status, "ready");
    assert.equal(first.profile.readiness.score, 90);

    const loaded = loadProfile(root, "prod_test_001");
    assert.ok(loaded);
    assert.equal(loaded?.company.name, "ACME Valves");

    const second = saveProfile(
      root,
      {
        competitors: [{ name: "Rival Co" }],
      },
      "prod_test_001"
    );

    assert.equal(second.created, false);
    assert.equal(second.profile.competitors.length, 1);
    assert.equal(second.profile.readiness.score, 100);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saveKeywords persists R2 site_id and rejects missing site_id", () => {
  const root = createTempProject();
  const dimensions = {
    product: ["WPC decking"],
    scenario: [],
    buyer: ["distributor"],
    geo: [],
    competitor: [],
  };

  try {
    const saved = saveKeywords(root, "prod_test_001", {
      product_id: "prod_test_001",
      dimensions,
      search_queries: [
        {
          id: "q_001",
          query: "WPC decking distributor Germany",
          dimension: "buyer",
          language: "en",
          priority: "high",
          round: "R2",
          site_id: "linkedin_company",
        },
      ],
    });
    assert.equal(saved.search_queries[0].site_id, "linkedin_company");

    const loaded = loadKeywords(root, "prod_test_001");
    assert.equal(loaded?.search_queries[0].site_id, "linkedin_company");

    assert.throws(
      () =>
        saveKeywords(root, "prod_test_001", {
          product_id: "prod_test_001",
          dimensions,
          search_queries: [
            {
              id: "q_002",
              query: "WPC decking distributor Germany",
              dimension: "buyer",
              language: "en",
              priority: "high",
              round: "R2",
            },
          ],
        }),
      /site_id/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
