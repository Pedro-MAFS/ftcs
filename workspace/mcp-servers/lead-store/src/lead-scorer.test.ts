import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dedupeRawLeads,
  getDedupeKey,
  scoreRawLead,
} from "./lead-scorer.js";
import { loadScoringConfig } from "./scoring-config.js";
import { appendRawLead, scoreAndDedupeLeads } from "./lead-storage.js";
import { saveProfile } from "./storage.js";
import type { RawLead } from "./lead-types.js";

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ftcs-scorer-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(
    join(dir, "config", "scoring-rules.yaml"),
    `weights:
  product_match: 0.30
  purchase_intent: 0.25
  size_fit: 0.15
  geo_match: 0.15
  reachability: 0.10
  competition: 0.05
tiers:
  high: 80
  medium: 60
  low: 40
profile_readiness_threshold: 60
`,
    "utf8"
  );
  mkdirSync(join(dir, "data", "products"), { recursive: true });
  return dir;
}

function sampleProfileInput() {
  return {
    company: { name: "GreenSen WPC", website: "https://lvsen.test", country: "CN" },
    products: [
      {
        name: "WPC Decking",
        name_en: "WPC Decking",
        use_cases: ["outdoor", "landscape"],
      },
    ],
    buyer_personas: [{ company_types: ["distributor", "retailer"] }],
    target_markets: { regions: ["EU", "NA"] },
  };
}

function sampleLead(partial: Partial<RawLead> & Pick<RawLead, "id">): RawLead {
  return {
    product_id: "prod_test_score",
    discovered_at: "2026-07-12T10:00:00Z",
    round: "R1",
    query_id: "q_001",
    company: {
      name: "ABC Decking GmbH",
      website: "https://abc-decking.de",
      country: "DE",
      description: "WPC decking distributor in Germany",
    },
    source: {
      url: "https://abc-decking.de/products",
      type: "tavily_search",
      snippet: "Outdoor WPC decking wholesaler",
    },
    match_reason: "德国 WPC decking distributor，经销户外地板",
    contacts: [{ type: "email", value: "sales@abc-decking.de", confidence: "medium" }],
    raw_score: 75,
    ...partial,
  };
}

test("dedupeRawLeads keeps one lead per domain with best completeness", () => {
  const leads = dedupeRawLeads([
    sampleLead({ id: "lead_a" }),
    sampleLead({
      id: "lead_b",
      company: {
        name: "ABC Decking GmbH",
        website: "https://www.abc-decking.de/about",
        country: "DE",
      },
      contacts: [],
      raw_score: 50,
    }),
  ]);

  assert.equal(leads.length, 1);
  assert.equal(getDedupeKey(leads[0]!), "abc-decking.de");
});

test("scoreRawLead returns breakdown and tier", () => {
  const root = createTempProject();
  try {
    const profile = saveProfile(root, sampleProfileInput(), "prod_test_score").profile;
    const config = loadScoringConfig(root);
    const result = scoreRawLead(profile, sampleLead({ id: "lead_1" }), config);

    assert.ok(result.score_breakdown.product_match > 0);
    assert.ok(result.score_breakdown.purchase_intent > 0);
    assert.ok(result.score_breakdown.geo_match > 0);
    assert.ok(["high", "medium", "low"].includes(result.tier));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoreAndDedupeLeads writes scored.json without duplicate domains", () => {
  const root = createTempProject();
  const productId = "prod_test_score";

  try {
    saveProfile(root, sampleProfileInput(), productId);

    appendRawLead(root, productId, "R1", sampleLead({ id: "lead_1" }));
    appendRawLead(
      root,
      productId,
      "R1",
      sampleLead({
        id: "lead_2",
        company: {
          name: "ABC Decking GmbH",
          website: "https://abc-decking.de/contact",
          country: "DE",
        },
      })
    );
    appendRawLead(
      root,
      productId,
      "R1",
      sampleLead({
        id: "lead_3",
        company: {
          name: "US Decking Co",
          website: "https://us-decking.com",
          country: "US",
        },
        match_reason: "US WPC decking importer and retailer",
      })
    );

    const result = scoreAndDedupeLeads(root, productId);
    assert.equal(result.raw_total, 3);
    assert.equal(result.deduped_total, 2);
    assert.equal(result.scored.leads.length, 2);

    const dedupeKeys = result.scored.leads.map((lead) => lead.dedupe_key);
    assert.equal(new Set(dedupeKeys).size, dedupeKeys.length);

    for (const lead of result.scored.leads) {
      assert.ok(lead.score_breakdown);
      assert.ok(lead.tier);
      assert.ok(lead.match_reason);
      assert.ok(lead.source_url);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
