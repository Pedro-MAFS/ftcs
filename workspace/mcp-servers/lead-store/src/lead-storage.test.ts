import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendRawLead,
  createExplorationRun,
  listRawLeads,
  loadExplorationRun,
  updateExplorationRun,
} from "./lead-storage.js";
import { saveProfile } from "./storage.js";

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ftcs-lead-storage-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(
    join(dir, "config", "scoring-rules.yaml"),
    "profile_readiness_threshold: 60\n",
    "utf8"
  );
  mkdirSync(join(dir, "data", "products"), { recursive: true });
  return dir;
}

test("appendRawLead writes jsonl and exploration run tracks progress", () => {
  const root = createTempProject();
  const productId = "prod_test_leads";

  try {
    saveProfile(
      root,
      {
        company: { name: "ACME", website: "https://acme.test" },
        products: [{ name: "Deck", name_en: "WPC Decking", use_cases: ["outdoor"] }],
        buyer_personas: [{ company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
      },
      productId
    );

    const run = createExplorationRun(root, productId, ["R1"]);
    assert.equal(run.status, "running");

    appendRawLead(root, productId, "R1", {
      product_id: productId,
      round: "R1",
      query_id: "q_001",
      run_id: run.id,
      company: {
        name: "ABC Decking",
        website: "https://abc-decking.de",
        country: "DE",
      },
      source: {
        url: "https://abc-decking.de/products",
        type: "tavily_search",
        snippet: "WPC decking distributor",
      },
      match_reason: "德国 WPC 地板经销商，与目标市场匹配",
      contacts: [],
      raw_score: 70,
    });

    appendRawLead(root, productId, "R1", {
      product_id: productId,
      round: "R1",
      query_id: "q_002",
      company: {
        name: "Legacy Corp",
        website: "https://legacy.example",
        country: "US",
      },
      source: {
        url: "https://legacy.example",
        type: "manual",
      },
      match_reason: "历史线索无 run_id",
      contacts: [],
    });

    const leads = listRawLeads(root, productId, "R1");
    assert.equal(leads.length, 2);
    assert.equal(leads[0]?.source.url, "https://abc-decking.de/products");
    assert.equal(leads[0]?.run_id, run.id);
    assert.ok(leads[0]?.match_reason);

    const byRun = listRawLeads(root, productId, "R1", run.id);
    assert.equal(byRun.length, 1);
    assert.equal(byRun[0]?.company.name, "ABC Decking");

    updateExplorationRun(root, productId, run.id, {
      queries_executed: 1,
      api_usage: { search_calls: 1, crawl_pages: 3 },
    });

    const loaded = loadExplorationRun(root, productId, run.id);
    assert.equal(loaded?.queries_executed, 1);
    assert.equal(loaded?.api_usage.search_calls, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
