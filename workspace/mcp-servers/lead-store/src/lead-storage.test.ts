import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  appendRawLead,
  appendRawLeadFromTool,
  createExplorationRun,
  listRawLeads,
  loadExplorationRun,
  patchScoredLead,
  scoreAndDedupeLeads,
  loadScoredLeads,
  findScoredLeadById,
  findScoredLeadForDomain,
  matchAppendRawSkip,
  saveScoredLeads,
  setLeadCompanyIntelligence,
  toCompanyIntelligenceSkipToolResult,
  updateExplorationRun,
} from "./lead-storage.js";
import { getDiscardedLeadsPath, getRawLeadsPath, getScoredLeadsPath } from "./paths.js";
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
    appendRawLead(root, productId, "R1", {
      ...rawInput(productId, "Other Co"),
      company: {
        name: "Other Co",
        website: "https://other.example",
        country: "US",
      },
      source: { url: "https://other.example", type: "manual" },
    });
    scoreAndDedupeLeads(root, productId);
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");

    const saved = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      rawInput(productId),
      portraitTexts({ icebreak: "用户改过的破冰" }),
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const beforeIds = listRawLeads(root, productId).map((lead) => lead.id);

    const next = portraitTexts({
      businessModel: "新的商业模式",
      icebreak: "新的破冰",
    });
    const updated = setLeadCompanyIntelligence(root, productId, saved.lead.id, next);
    assert.equal(updated.ok, true);
    assert.equal("skipped" in updated, false);
    assert.deepEqual(listRawLeads(root, productId).map((lead) => lead.id), beforeIds);

    const raw = listRawLeads(root, productId).find((lead) => lead.id === saved.lead.id)!;
    assert.equal(raw.companyIntelligence?.status, "ready");
    assert.equal(raw.companyIntelligence?.businessModel, "新的商业模式");
    assert.equal(raw.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(raw.companyIntelligence?.errorMessage, undefined);
    assert.equal(raw.company.name, "ABC Decking");
    assert.equal(raw.company.website, "https://abc-decking.de");
    assert.equal(raw.contacts[0]?.value, "sales@abc-decking.de");
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);

    const failed = setLeadCompanyIntelligence(root, productId, saved.lead.id, {
      businessModel: "缺了其它字段",
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.message, COMPANY_INTELLIGENCE_INVALID_MESSAGE);
    }
    const restored = listRawLeads(root, productId).find((lead) => lead.id === saved.lead.id)!;
    assert.equal(restored.companyIntelligence?.status, "failed");
    assert.equal(restored.companyIntelligence?.errorMessage, COMPANY_INTELLIGENCE_INVALID_MESSAGE);
    assert.equal(restored.companyIntelligence?.icebreak, "新的破冰");
    assert.equal(restored.companyIntelligence?.businessModel, "新的商业模式");
    assert.equal(restored.company.name, "ABC Decking");
    assert.equal(restored.company.website, "https://abc-decking.de");
    assert.equal(restored.contacts[0]?.value, "sales@abc-decking.de");
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);

    const missing = setLeadCompanyIntelligence(root, productId, "lead_missing", next);
    assert.equal(missing.ok, false);
    assert.equal(listRawLeads(root, productId).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function saveReadyProfile(root: string, productId: string): void {
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
}

function domainLead(
  productId: string,
  sourceUrl: string,
  website?: string,
  name = "Example Co",
  id?: string,
): RawLeadInput {
  return {
    id,
    product_id: productId,
    round: "R1",
    query_id: "q_dd",
    company: {
      name,
      ...(website !== undefined ? { website } : {}),
      country: "DE",
    },
    source: { url: sourceUrl, type: "manual", snippet: "发现：测试" },
    match_reason: "测试线索",
    contacts: [],
  };
}

function seedScoredLead(
  root: string,
  productId: string,
  website: string,
  icebreak = "已知破冰原文",
  id?: string,
  name = "Example Co",
) {
  const saved = appendRawLeadFromTool(
    root,
    productId,
    "R1",
    domainLead(productId, website, website, name, id),
    portraitTexts({ icebreak }),
  );
  assert.equal(saved.ok, true);
  if (!saved.ok) {
    throw new Error("seed failed");
  }
  scoreAndDedupeLeads(root, productId);
  return saved.lead;
}

test("US-DD-01 T1 T2 T4 T6 T9 append skips a domain already in the library", () => {
  const root = createTempProject();
  const productId = "prod_dd_skip_append";
  try {
    saveReadyProfile(root, productId);
    const existing = seedScoredLead(root, productId, "https://example.com", "已知破冰原文", "lead_lib");
    const scored = loadScoredLeads(root, productId)!;
    scored.leads.push({
      ...scored.leads[0]!,
      id: "lead_later",
    });
    saveScoredLeads(root, scored);
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const rawBefore = readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8");
    const idsBefore = listRawLeads(root, productId).map((lead) => lead.id);

    const cases = [
      "https://www.Example.com/path",
      "http://example.com",
      "https://example.com:8443/a",
    ];
    for (const website of cases) {
      const skip = matchAppendRawSkip(root, productId, website, "https://unused.example/source");
      assert.ok(skip);
      assert.equal(skip.success, true);
      assert.equal(skip.skipped, true);
      assert.equal(skip.reason, "domain_already_in_library");
      assert.equal(skip.domain, "example.com");
      assert.equal(skip.matched_lead_id, existing.id);
      assert.equal(skip.wrote, false);
      assert.equal(skip.message, "线索已存在");
      assert.equal("lead_id" in skip, false);
      assert.equal("raw_path" in skip, false);
      assert.equal("isError" in skip, false);
      assert.equal("code" in skip, false);
    }

    const fromSource = matchAppendRawSkip(
      root,
      productId,
      undefined,
      "https://www.Example.com/path",
    );
    assert.equal(fromSource?.domain, "example.com");
    assert.equal(fromSource?.matched_lead_id, existing.id);

    const invalidPortrait = { businessModel: "只有一段" };
    assert.equal(validateCompanyIntelligenceInput(invalidPortrait).ok, false);
    const skippedDespiteInvalid = matchAppendRawSkip(
      root,
      productId,
      "https://www.Example.com/path",
      "https://www.Example.com/path",
    );
    assert.equal(skippedDespiteInvalid?.skipped, true);
    assert.equal(skippedDespiteInvalid?.message, "线索已存在");
    assert.notEqual(
      (skippedDespiteInvalid as { code?: string } | null)?.code,
      "INVALID_COMPANY_INTELLIGENCE",
    );

    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);
    assert.equal(readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8"), rawBefore);
    assert.deepEqual(listRawLeads(root, productId).map((lead) => lead.id), idsBefore);
    assert.equal(
      loadScoredLeads(root, productId)?.leads.find((lead) => lead.id === existing.id)
        ?.companyIntelligence?.icebreak,
      "已知破冰原文",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 T3 T5 T7 T8 T10 T11 new or unparsable domains still append", () => {
  const root = createTempProject();
  const productId = "prod_dd_append";
  const otherProduct = "prod_dd_other";
  try {
    saveReadyProfile(root, productId);
    saveReadyProfile(root, otherProduct);
    const library = seedScoredLead(root, productId, "https://example.com", "库内破冰", "lead_root");
    const otherLibrary = seedScoredLead(root, otherProduct, "https://shop.example.com", "乙的破冰");
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const otherScoredBefore = readFileSync(getScoredLeadsPath(root, otherProduct), "utf8");

    const shop = domainLead(productId, "https://shop.example.com/x", "https://shop.example.com/x", "Shop Co");
    assert.equal(matchAppendRawSkip(root, productId, shop.company.website, shop.source.url), null);
    const shopSaved = appendRawLeadFromTool(root, productId, "R1", shop, portraitTexts());
    assert.equal(shopSaved.ok, true);
    if (!shopSaved.ok) return;
    assert.notEqual(shopSaved.lead.id, library.id);
    assert.equal(shopSaved.lead.companyIntelligence?.status, "ready");

    const bare = domainLead(productId, "https://bare.example/page", "example.com", "example.com");
    assert.equal(matchAppendRawSkip(root, productId, bare.company.website, bare.source.url), null);
    const bareSaved = appendRawLeadFromTool(root, productId, "R1", bare, portraitTexts());
    assert.equal(bareSaved.ok, true);

    const emptyWebsite = domainLead(productId, "https://example.com/from-source", "", "Empty Site");
    assert.equal(
      matchAppendRawSkip(root, productId, emptyWebsite.company.website, emptyWebsite.source.url),
      null,
    );
    const emptySaved = appendRawLeadFromTool(root, productId, "R1", emptyWebsite, portraitTexts());
    assert.equal(emptySaved.ok, true);

    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);
    assert.equal(readFileSync(getScoredLeadsPath(root, otherProduct), "utf8"), otherScoredBefore);
    assert.equal(otherLibrary.company.website, "https://shop.example.com");

    const freshRoot = createTempProject();
    const freshId = "prod_dd_empty";
    try {
      const noFile = domainLead(freshId, "https://new.example", "https://new.example");
      assert.equal(matchAppendRawSkip(freshRoot, freshId, noFile.company.website, noFile.source.url), null);
      assert.equal(findScoredLeadForDomain(freshRoot, freshId, "new.example"), null);
      const noFileSaved = appendRawLeadFromTool(freshRoot, freshId, "R1", noFile, portraitTexts());
      assert.equal(noFileSaved.ok, true);
      assert.equal(listRawLeads(freshRoot, freshId).length, 1);

      saveScoredLeads(freshRoot, {
        product_id: freshId,
        updated_at: "2026-10-19T00:00:00.000Z",
        leads: [],
        stats: { total: 0, by_tier: {}, by_status: {} },
      });
      const emptyLibrary = domainLead(freshId, "https://empty-lib.example", "https://empty-lib.example");
      assert.equal(
        matchAppendRawSkip(freshRoot, freshId, emptyLibrary.company.website, emptyLibrary.source.url),
        null,
      );
      const emptyLibrarySaved = appendRawLeadFromTool(
        freshRoot,
        freshId,
        "R1",
        emptyLibrary,
        portraitTexts(),
      );
      assert.equal(emptyLibrarySaved.ok, true);
      assert.equal(listRawLeads(freshRoot, freshId).length, 2);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }

    const discardedOnly = createTempProject();
    const discardedProduct = "prod_dd_discarded";
    try {
      const discardedPath = getDiscardedLeadsPath(discardedOnly, discardedProduct);
      mkdirSync(dirname(discardedPath), { recursive: true });
      writeFileSync(
        discardedPath,
        `${JSON.stringify({ leads: [{ dedupe_key: "example.com", reason: "duplicate_domain" }] })}\n`,
        "utf8",
      );
      const fromDiscarded = domainLead(
        discardedProduct,
        "https://example.com",
        "https://example.com",
      );
      assert.equal(
        matchAppendRawSkip(discardedOnly, discardedProduct, fromDiscarded.company.website, fromDiscarded.source.url),
        null,
      );
      const discardedSaved = appendRawLeadFromTool(
        discardedOnly,
        discardedProduct,
        "R1",
        fromDiscarded,
        portraitTexts(),
      );
      assert.equal(discardedSaved.ok, true);
      assert.equal(listRawLeads(discardedOnly, discardedProduct).length, 1);
    } finally {
      rmSync(discardedOnly, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 T12 same domain twice before scoring appends both rows", () => {
  const root = createTempProject();
  const productId = "prod_dd_twice";
  try {
    saveReadyProfile(root, productId);
    seedScoredLead(root, productId, "https://kept.example", "旧行破冰", "lead_kept");
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const first = domainLead(productId, "https://www.Fresh.example/a", "https://www.Fresh.example/a", "Fresh A");
    const second = domainLead(productId, "http://fresh.example/b", "http://fresh.example/b", "Fresh B");
    assert.equal(matchAppendRawSkip(root, productId, first.company.website, first.source.url), null);
    const savedFirst = appendRawLeadFromTool(root, productId, "R1", first, portraitTexts({ icebreak: "第一家" }));
    assert.equal(matchAppendRawSkip(root, productId, second.company.website, second.source.url), null);
    const savedSecond = appendRawLeadFromTool(root, productId, "R1", second, portraitTexts({ icebreak: "第二家" }));
    assert.equal(savedFirst.ok, true);
    assert.equal(savedSecond.ok, true);
    if (!savedFirst.ok || !savedSecond.ok) return;
    assert.notEqual(savedFirst.lead.id, savedSecond.lead.id);
    const fresh = listRawLeads(root, productId).filter((lead) =>
      lead.company.website?.includes("fresh.example") || lead.company.website?.includes("Fresh.example"),
    );
    assert.equal(fresh.length, 2);
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);

    const deduped = scoreAndDedupeLeads(root, productId);
    assert.equal(deduped.discarded_total, 1);
    assert.equal(deduped.discarded.leads[0]?.reason, "duplicate_domain");
    const freshScored = deduped.scored.leads.filter((lead) => lead.dedupe_key === "fresh.example");
    assert.equal(freshScored.length, 1);
    assert.equal(
      deduped.scored.leads.find((lead) => lead.id === "lead_kept")?.companyIntelligence?.icebreak,
      "旧行破冰",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 T13 T15 T16 set company intelligence skips library hits", () => {
  const root = createTempProject();
  const productId = "prod_dd_set_skip";
  try {
    saveReadyProfile(root, productId);
    const scoredLead = seedScoredLead(
      root,
      productId,
      "https://example.com",
      "已知破冰原文",
      "lead_scored",
    );
    const scoredBytes = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const rawBytes = readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8");
    const idsBefore = listRawLeads(root, productId).map((lead) => lead.id);

    const skipped = setLeadCompanyIntelligence(
      root,
      productId,
      scoredLead.id,
      portraitTexts({ icebreak: "不该写上的破冰" }),
    );
    assert.equal(skipped.ok, true);
    if (!skipped.ok || !("skipped" in skipped)) {
      assert.fail("expected skip");
    }
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.domain, "example.com");
    assert.equal(skipped.leadId, scoredLead.id);
    assert.equal(skipped.matchedLeadId, scoredLead.id);
    const toolBody = toCompanyIntelligenceSkipToolResult(skipped);
    assert.deepEqual(toolBody, {
      success: true,
      skipped: true,
      reason: "domain_already_in_library",
      domain: "example.com",
      lead_id: scoredLead.id,
      matched_lead_id: scoredLead.id,
      wrote: false,
      message: "线索已存在",
    });
    assert.equal("isError" in toolBody, false);
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBytes);
    assert.equal(readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8"), rawBytes);
    assert.deepEqual(listRawLeads(root, productId).map((lead) => lead.id), idsBefore);

    const rawOnly = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      domainLead(productId, "https://www.Example.com/about", "https://www.Example.com/about", "Raw Twin", "lead_raw_twin"),
      portraitTexts({ icebreak: "A的破冰" }),
    );
    assert.equal(rawOnly.ok, true);
    if (!rawOnly.ok) return;
    const beforeCross = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const rawCross = readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8");
    const cross = setLeadCompanyIntelligence(
      root,
      productId,
      rawOnly.lead.id,
      portraitTexts({ icebreak: "不该覆盖 A" }),
    );
    assert.equal(cross.ok, true);
    if (!cross.ok || !("skipped" in cross)) {
      assert.fail("expected domain skip");
    }
    assert.equal(cross.domain, "example.com");
    assert.equal(cross.leadId, rawOnly.lead.id);
    assert.equal(cross.matchedLeadId, scoredLead.id);
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), beforeCross);
    assert.equal(readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8"), rawCross);

    const missingBytes = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const missing = setLeadCompanyIntelligence(root, productId, "lead_missing", portraitTexts());
    assert.deepEqual(missing, { ok: false, message: "未找到线索" });
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), missingBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 T14 raw-only same domain still overwrites that raw row", () => {
  const root = createTempProject();
  const productId = "prod_dd_raw_only";
  try {
    saveReadyProfile(root, productId);
    seedScoredLead(root, productId, "https://other.example", "别人的破冰", "lead_other");
    const saved = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      domainLead(productId, "https://only-raw.example", "https://only-raw.example", "Only Raw"),
      portraitTexts({ icebreak: "旧破冰" }),
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const idsBefore = listRawLeads(root, productId).map((lead) => lead.id);
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");

    const updated = setLeadCompanyIntelligence(
      root,
      productId,
      saved.lead.id,
      portraitTexts({ icebreak: "覆盖后的破冰", businessModel: "只改这条 raw" }),
    );
    assert.equal(updated.ok, true);
    assert.equal("skipped" in updated, false);
    const raw = listRawLeads(root, productId).find((lead) => lead.id === saved.lead.id)!;
    assert.equal(raw.companyIntelligence?.icebreak, "覆盖后的破冰");
    assert.equal(raw.companyIntelligence?.businessModel, "只改这条 raw");
    assert.equal(raw.companyIntelligence?.status, "ready");
    assert.deepEqual(listRawLeads(root, productId).map((lead) => lead.id), idsBefore);
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);
    assert.equal(findScoredLeadForDomain(root, productId, "only-raw.example"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 null domain does not skip by company name or rewrite other scored rows", () => {
  const root = createTempProject();
  const productId = "prod_dd_null_domain";
  try {
    saveReadyProfile(root, productId);
    const scoredLead = seedScoredLead(
      root,
      productId,
      "example.com",
      "库内破冰",
      "lead_named",
      "Acme Decks",
    );
    assert.equal(loadScoredLeads(root, productId)?.leads[0]?.dedupe_key, "acme decks");
    const saved = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      domainLead(productId, "https://source.example/no-host", "example.com", "Acme Decks"),
      portraitTexts({ icebreak: "raw 旧破冰" }),
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(
      matchAppendRawSkip(root, productId, "example.com", "https://example.com"),
      null,
    );
    const scoredBefore = readFileSync(getScoredLeadsPath(root, productId), "utf8");
    const updated = setLeadCompanyIntelligence(
      root,
      productId,
      saved.lead.id,
      portraitTexts({ icebreak: "只改 raw" }),
    );
    assert.equal(updated.ok, true);
    assert.equal("skipped" in updated, false);
    assert.equal(
      listRawLeads(root, productId).find((lead) => lead.id === saved.lead.id)?.companyIntelligence?.icebreak,
      "只改 raw",
    );
    assert.equal(readFileSync(getScoredLeadsPath(root, productId), "utf8"), scoredBefore);
    assert.equal(
      loadScoredLeads(root, productId)?.leads.find((lead) => lead.id === scoredLead.id)?.companyIntelligence
        ?.icebreak,
      "库内破冰",
    );

    const self = setLeadCompanyIntelligence(
      root,
      productId,
      scoredLead.id,
      portraitTexts({ icebreak: "不该改库内" }),
    );
    assert.equal(self.ok, true);
    if (!self.ok || !("skipped" in self)) {
      assert.fail("id already in library should skip");
    }
    assert.equal(self.domain, null);
    assert.equal(self.matchedLeadId, scoredLead.id);
    assert.equal(toCompanyIntelligenceSkipToolResult(self).domain, null);
    assert.equal(
      loadScoredLeads(root, productId)?.leads.find((lead) => lead.id === scoredLead.id)?.companyIntelligence
        ?.icebreak,
      "库内破冰",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 corrupt scored file throws before any write", () => {
  const root = createTempProject();
  const productId = "prod_dd_corrupt";
  try {
    const saved = appendRawLeadFromTool(
      root,
      productId,
      "R1",
      domainLead(productId, "https://example.com", "https://example.com"),
      portraitTexts(),
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const scoredPath = getScoredLeadsPath(root, productId);
    mkdirSync(dirname(scoredPath), { recursive: true });
    writeFileSync(scoredPath, "{", "utf8");
    const rawBefore = readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8");
    assert.throws(() => matchAppendRawSkip(root, productId, "https://example.com", "https://example.com"));
    assert.throws(() => findScoredLeadById(root, productId, saved.lead.id));
    assert.throws(() =>
      setLeadCompanyIntelligence(root, productId, saved.lead.id, portraitTexts({ icebreak: "不该写下" })),
    );
    assert.equal(readFileSync(scoredPath, "utf8"), "{");
    assert.equal(readFileSync(getRawLeadsPath(root, productId, "R1"), "utf8"), rawBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("US-DD-01 tool callbacks skip before write and do not mark skip as isError", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
  const appendAt = source.indexOf('server.tool(\n  "lead_append_raw"');
  const setAt = source.indexOf('server.tool(\n  "lead_set_company_intelligence"');
  const listAt = source.indexOf('server.tool(\n  "lead_list_raw"');
  assert.ok(appendAt >= 0 && setAt > appendAt && listAt > setAt);
  const append = source.slice(appendAt, setAt);
  const set = source.slice(setAt, listAt);
  assert.match(append, /matchAppendRawSkip[\s\S]*appendRawLeadFromTool/);
  assert.equal(append.includes("scored.json"), false);
  assert.equal(set.includes("scored.json"), false);
  const appendSkip = append.slice(append.indexOf("if (skip)"), append.indexOf("appendRawLeadFromTool"));
  assert.equal(appendSkip.includes("isError"), false);
  assert.match(set, /"skipped" in result[\s\S]*toCompanyIntelligenceSkipToolResult/);
  const setSkip = set.slice(set.indexOf('"skipped" in result'), set.indexOf("lead_id: result.leadId"));
  assert.equal(setSkip.includes("isError"), false);
});
