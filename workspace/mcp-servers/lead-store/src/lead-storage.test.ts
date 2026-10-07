import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendRawLead,
  appendRawLeadFromTool,
  createExplorationRun,
  listRawLeads,
  loadExplorationRun,
  patchScoredLead,
  scoreAndDedupeLeads,
  loadScoredLeads,
  saveScoredLeads,
  setLeadCompanyIntelligence,
  updateExplorationRun,
} from "./lead-storage.js";
import { saveProfile } from "./storage.js";
import type { PersonInput } from "./person-types.js";
import {
  COMPANY_INTELLIGENCE_INVALID_MESSAGE,
  validateCompanyIntelligenceInput,
  type CompanyIntelligenceTexts,
  type RawLeadInput,
} from "./lead-types.js";

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

test("patchScoredLead adds and updates people, preserves on re-score", () => {
  const root = createTempProject();
  const productId = "prod_patch_test";

  try {
    saveProfile(
      root,
      {
        company: { name: "Test Co", website: "https://test.test" },
        products: [{ name: "Widget", name_en: "Widget", use_cases: ["industrial"] }],
        buyer_personas: [{ company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
      },
      productId
    );

    // 先造一条 scored lead
    appendRawLead(root, productId, "R1", {
      product_id: productId,
      round: "R1",
      query_id: "q_001",
      company: { name: "Pantron", website: "https://pantron.com", country: "US" },
      source: { url: "https://pantron.com", type: "manual" },
      match_reason: "测试线索",
      contacts: [],
    });
    scoreAndDedupeLeads(root, productId);
    const scored = loadScoredLeads(root, productId);
    const leadId = scored!.leads[0]!.id;

    const people: PersonInput[] = [
      {
        name: "Steve",
        first_name: "Steve",
        last_name: null,
        title: null,
        role_match: null,
        match_reason: "personal 邮箱 + confidence 84",
        email: "steve@pantron.com",
        email_status: "hunter_valid",
        confidence: 84,
        sources: [{ domain: "kfia.org", uri: "https://kfia.org/page", extracted_on: "2026-05-19", last_seen_on: "2026-08-07", still_on_page: true }],
        provider: "hunter",
      },
      {
        name: "info",
        first_name: null,
        last_name: null,
        title: null,
        role_match: null,
        match_reason: "generic 邮箱 + confidence 81",
        email: "info@pantron.com",
        email_status: "hunter_unverified",
        confidence: 81,
        sources: [{ domain: "pantron.com", uri: "https://pantron.com", extracted_on: "2026-08-18", last_seen_on: "2026-09-04", still_on_page: true }],
        provider: "hunter",
      },
    ];

    const result = patchScoredLead(root, productId, leadId, people);
    assert.equal(result.people_added, 2);
    assert.equal(result.people_total, 2);

    // 验证排序：personal (steve) 应在 generic (info) 前
    const after = loadScoredLeads(root, productId);
    const lead = after!.leads.find((l) => l.id === leadId)!;
    assert.equal(lead.people.length, 2);
    assert.equal(lead.people[0]!.email, "steve@pantron.com");
    assert.equal(lead.people[0]!.email_status, "hunter_valid");
    assert.ok(lead.people[0]!.id.startsWith("person_"));
    assert.ok(lead.people[1]!.id.startsWith("person_"));
    assert.notEqual(lead.people[0]!.id, lead.people[1]!.id);

    // patch 重复 email → 更新而非新增
    const result2 = patchScoredLead(root, productId, leadId, [
      { ...people[0]!, match_reason: "更新后的理由", confidence: 90 },
    ]);
    assert.equal(result2.people_updated, 1);
    assert.equal(result2.people_added, 0);
    assert.equal(result2.people_total, 2);

    const after2 = loadScoredLeads(root, productId);
    const lead2 = after2!.leads.find((l) => l.id === leadId)!;
    assert.equal(lead2.people.length, 2);
    assert.equal(lead2.people[0]!.match_reason, "更新后的理由");
    assert.equal(lead2.people[0]!.confidence, 90);

    // 重新评分后 people 保留
    scoreAndDedupeLeads(root, productId);
    const after3 = loadScoredLeads(root, productId);
    const lead3 = after3!.leads.find((l) => l.dedupe_key === "pantron.com")!;
    assert.equal(lead3.people.length, 2);
    assert.equal(lead3.people[0]!.email, "steve@pantron.com");

    // 不存在的 lead 报错
    assert.throws(() => patchScoredLead(root, productId, "lead_nonexistent", people), /not found/);

    // C7：sync_valid_to_contacts 追加 hunter_valid personal；generic 不追加；去重
    const withSales: PersonInput = {
      name: "sales",
      first_name: null,
      last_name: null,
      title: null,
      role_match: null,
      match_reason: "generic",
      email: "sales@pantron.com",
      email_status: "hunter_valid",
      confidence: 90,
      sources: [{ domain: "pantron.com", uri: "https://pantron.com", extracted_on: "2026-08-18", last_seen_on: "2026-09-04", still_on_page: true }],
      provider: "hunter",
    };
    const syncResult = patchScoredLead(
      root,
      productId,
      leadId,
      [
        { ...people[0]!, email_status: "hunter_valid", confidence: 84 },
        withSales,
      ],
      { sync_valid_to_contacts: true }
    );
    assert.equal(syncResult.contacts_appended, 1);
    const afterSync = loadScoredLeads(root, productId);
    const leadSync = afterSync!.leads.find((l) => l.id === leadId)!;
    const emails = leadSync.contacts.filter((c) => c.type === "email").map((c) => c.value.toLowerCase());
    assert.ok(emails.includes("steve@pantron.com"));
    assert.ok(!emails.includes("sales@pantron.com"));

    // 再次 sync 不重复追加
    const syncAgain = patchScoredLead(root, productId, leadId, [people[0]!], {
      sync_valid_to_contacts: true,
    });
    assert.equal(syncAgain.contacts_appended, 0);

    // US-C-04：patch 未包含的 manual people 必须保留
    const manualPerson: PersonInput = {
      name: "Alice",
      first_name: "Alice",
      last_name: null,
      title: null,
      role_match: null,
      match_reason: "用户手工录入",
      email: "alice.manual@pantron.com",
      email_status: "hunter_unverified",
      confidence: 0,
      sources: [
        {
          domain: "manual",
          uri: "urn:ftcs:manual",
          extracted_on: "2026-09-15",
          last_seen_on: "2026-09-15",
          still_on_page: true,
        },
      ],
      provider: "manual",
    };
    patchScoredLead(root, productId, leadId, [manualPerson]);
    patchScoredLead(root, productId, leadId, [people[0]!]);
    const afterManual = loadScoredLeads(root, productId);
    const leadManual = afterManual!.leads.find((l) => l.id === leadId)!;
    assert.ok(
      leadManual.people.some((p) => p.email === "alice.manual@pantron.com" && p.provider === "manual"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function portraitTexts(overrides: Partial<CompanyIntelligenceTexts> = {}): CompanyIntelligenceTexts {
  return {
    businessModel: "区域经销，团队约二十人",
    productsBrands: "暂无公开信息",
    targetMarket: "德国园林与建材零售",
    supplyChain: "倾向向工厂直接采购",
    industryPosition: "当地户外地面材料分销",
    collabOpportunity: "可寄样并跟进季度订单",
    icebreak: "你好，看到你们在做户外地面，我们供应共挤地板。",
    ...overrides,
  };
}

function rawInput(productId: string, name = "ABC Decking"): RawLeadInput {
  return {
    product_id: productId,
    round: "R1",
    query_id: "q_ci",
    company: {
      name,
      website: "https://abc-decking.de",
      country: "DE",
    },
    source: {
      url: "https://abc-decking.de/products",
      type: "tavily_search",
      snippet: "WPC decking distributor",
    },
    match_reason: "德国户外地板经销商",
    contacts: [{ type: "email", value: "sales@abc-decking.de", confidence: "medium" }],
  };
}

test("company intelligence validates seven strings and appends only when ready", () => {
  const texts = portraitTexts();
  const ok = validateCompanyIntelligenceInput(texts);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.texts.productsBrands, "暂无公开信息");
  }

  const missing = { ...texts } as Record<string, string>;
  delete missing.supplyChain;
  assert.equal(validateCompanyIntelligenceInput(missing).ok, false);
  assert.equal(validateCompanyIntelligenceInput({ ...texts, icebreak: 12 }).ok, false);
  assert.equal(validateCompanyIntelligenceInput({ ...texts, markdown: "# portrait" }).ok, false);
  assert.equal(validateCompanyIntelligenceInput({ ...texts, status: "ready" }).ok, false);
  assert.equal(
    validateCompanyIntelligenceInput({ ...texts, businessModel: "a".repeat(4001) }).ok,
    false,
  );
  assert.equal(validateCompanyIntelligenceInput({ ...texts, icebreak: "   " }).ok, false);
  assert.equal(
    validateCompanyIntelligenceInput({ ...texts, industryPosition: "a".repeat(4000) }).ok,
    true,
  );

  const root = createTempProject();
  const productId = "prod_ci_append";
  try {
    const rejected = appendRawLeadFromTool(root, productId, "R1", rawInput(productId), {
      ...texts,
      markdown: "# no",
    });
    assert.equal(rejected.ok, false);
    assert.equal(listRawLeads(root, productId).length, 0);

    const saved = appendRawLeadFromTool(root, productId, "R1", rawInput(productId), {
      ...texts,
      businessModel: "  区域经销  ",
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.lead.companyIntelligence?.status, "ready");
    assert.equal(saved.lead.companyIntelligence?.businessModel, "区域经销");
    assert.equal(saved.lead.companyIntelligence?.productsBrands, "暂无公开信息");
    assert.equal(saved.lead.companyIntelligence?.errorMessage, undefined);
    assert.ok(saved.lead.companyIntelligence?.updatedAt);
    assert.equal(listRawLeads(root, productId).length, 1);
    assert.equal(JSON.stringify(saved.lead).includes("markdown"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("score keeps company intelligence, people, and lifecycle status", () => {
  const root = createTempProject();
  const productId = "prod_ci_score";
  try {
    saveProfile(
      root,
      {
        company: { name: "ACME", website: "https://acme.test" },
        products: [{ name: "Deck", name_en: "WPC Decking", use_cases: ["outdoor"] }],
        buyer_personas: [{ company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
      },
      productId,
    );
    const texts = portraitTexts();
    const saved = appendRawLeadFromTool(root, productId, "R1", rawInput(productId), texts);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    scoreAndDedupeLeads(root, productId);
    const scored = loadScoredLeads(root, productId)!;
    const lead = scored.leads.find((item) => item.id === saved.lead.id)!;
    assert.deepEqual(lead.companyIntelligence, saved.lead.companyIntelligence);

    lead.status = "reviewed";
    saveScoredLeads(root, scored);
    patchScoredLead(root, productId, saved.lead.id, [
      {
        name: "Ann",
        first_name: "Ann",
        last_name: null,
        title: null,
        role_match: null,
        match_reason: "采购",
        email: "ann@abc-decking.de",
        email_status: "hunter_unverified",
        confidence: 70,
        sources: [
          {
            domain: "abc-decking.de",
            uri: "https://abc-decking.de",
            extracted_on: "2026-10-01",
            last_seen_on: "2026-10-01",
            still_on_page: true,
          },
        ],
        provider: "hunter",
      },
    ]);

    scoreAndDedupeLeads(root, productId);
    const again = loadScoredLeads(root, productId)!;
    const kept = again.leads.find((item) => item.id === saved.lead.id)!;
    assert.deepEqual(kept.companyIntelligence, saved.lead.companyIntelligence);
    assert.equal(kept.status, "reviewed");
    assert.equal(kept.people.length, 1);
    assert.equal(kept.people[0]?.email, "ann@abc-decking.de");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-score keeps scored company intelligence when raw has none", () => {
  const root = createTempProject();
  const productId = "prod_ci_preserve";
  try {
    saveProfile(
      root,
      {
        company: { name: "ACME", website: "https://acme.test" },
        products: [{ name: "Deck", name_en: "WPC Decking", use_cases: ["outdoor"] }],
        buyer_personas: [{ company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
      },
      productId,
    );
    appendRawLead(root, productId, "R1", rawInput(productId));
    scoreAndDedupeLeads(root, productId);
    const scored = loadScoredLeads(root, productId)!;
    const intel = {
      ...portraitTexts(),
      status: "ready" as const,
      updatedAt: "2026-10-07T00:00:00.000Z",
      icebreak: "保留的破冰",
    };
    scored.leads[0]!.companyIntelligence = intel;
    saveScoredLeads(root, scored);

    scoreAndDedupeLeads(root, productId);
    const again = loadScoredLeads(root, productId)!;
    assert.equal(again.leads[0]?.companyIntelligence?.icebreak, "保留的破冰");
    assert.equal(again.leads[0]?.companyIntelligence?.status, "ready");
    assert.equal(listRawLeads(root, productId)[0]?.companyIntelligence, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set company intelligence overwrites portrait and restores text on failure", () => {
  const root = createTempProject();
  const productId = "prod_ci_set";
  try {
    saveProfile(
      root,
      {
        company: { name: "ACME", website: "https://acme.test" },
        products: [{ name: "Deck", name_en: "WPC Decking", use_cases: ["outdoor"] }],
        buyer_personas: [{ company_types: ["distributor"] }],
        target_markets: { regions: ["EU"] },
      },
      productId,
    );
    const saved = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      rawInput(productId),
      portraitTexts({ icebreak: "用户改过的破冰" }),
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    scoreAndDedupeLeads(root, productId);
    const beforeIds = listRawLeads(root, productId).map((lead) => lead.id);

    const scored = loadScoredLeads(root, productId)!;
    const sibling = {
      ...scored.leads[0]!,
      id: "lead_sibling",
      companyIntelligence: {
        ...scored.leads[0]!.companyIntelligence!,
        icebreak: "另一行旧破冰",
      },
    };
    scored.leads.push(sibling);
    saveScoredLeads(root, scored);

    const next = portraitTexts({
      businessModel: "新的商业模式",
      icebreak: "新的破冰",
    });
    const updated = setLeadCompanyIntelligence(root, productId, saved.lead.id, next);
    assert.equal(updated.ok, true);
    assert.deepEqual(listRawLeads(root, productId).map((lead) => lead.id), beforeIds);

    const raw = listRawLeads(root, productId)[0]!;
    assert.equal(raw.companyIntelligence?.status, "ready");
    assert.equal(raw.companyIntelligence?.businessModel, "新的商业模式");
    assert.equal(raw.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(raw.companyIntelligence?.errorMessage, undefined);
    assert.equal(raw.company.name, "ABC Decking");
    assert.equal(raw.company.website, "https://abc-decking.de");

    const afterScore = loadScoredLeads(root, productId)!;
    const same = afterScore.leads.find((lead) => lead.id === saved.lead.id)!;
    const other = afterScore.leads.find((lead) => lead.id === "lead_sibling")!;
    assert.equal(same.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(other.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(other.companyIntelligence?.businessModel, "新的商业模式");
    assert.equal(same.contacts[0]?.value, "sales@abc-decking.de");

    const failed = setLeadCompanyIntelligence(root, productId, saved.lead.id, {
      businessModel: "缺了其它字段",
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.message, COMPANY_INTELLIGENCE_INVALID_MESSAGE);
    }
    const restored = listRawLeads(root, productId)[0]!;
    assert.equal(restored.companyIntelligence?.status, "failed");
    assert.equal(restored.companyIntelligence?.errorMessage, COMPANY_INTELLIGENCE_INVALID_MESSAGE);
    assert.equal(restored.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(restored.companyIntelligence?.businessModel, "新的商业模式");
    assert.equal(restored.company.name, "ABC Decking");
    assert.equal(restored.company.website, "https://abc-decking.de");
    assert.equal(restored.contacts[0]?.value, "sales@abc-decking.de");
    const failedScored = loadScoredLeads(root, productId)!;
    assert.equal(
      failedScored.leads.find((lead) => lead.id === saved.lead.id)?.companyIntelligence?.status,
      "failed",
    );
    assert.equal(
      failedScored.leads.find((lead) => lead.id === saved.lead.id)?.companyIntelligence?.icebreak,
      "新的破冰",
    );

    const missing = setLeadCompanyIntelligence(root, productId, "lead_missing", next);
    assert.equal(missing.ok, false);
    assert.equal(listRawLeads(root, productId).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
