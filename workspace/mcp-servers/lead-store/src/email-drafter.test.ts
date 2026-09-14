import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { draftEmailForLead, renderEmailDraftMarkdown } from "./email-drafter.js";
import {
  generateEmailDraftsForProduct,
  loadEmailDraft,
  saveEmailDraft,
} from "./email-storage.js";
import { saveProfile } from "./storage.js";
import { saveScoredLeads } from "./lead-storage.js";
import type { ScoredLead } from "./lead-types.js";

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ftcs-email-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(
    join(dir, "config", "scoring-rules.yaml"),
    "profile_readiness_threshold: 60\n",
    "utf8"
  );
  mkdirSync(join(dir, "data", "products"), { recursive: true });
  return dir;
}

function sampleScoredLead(): ScoredLead {
  return {
    id: "lead_20260712_0011",
    company: {
      name: "Covington Supply CO",
      website: "https://covingtonsupplyco.com/",
      country: "US",
      description: "US building materials supplier offering WPC decking wholesale.",
    },
    score: 86,
    score_breakdown: {
      product_match: 75,
      purchase_intent: 98,
      size_fit: 80,
      geo_match: 92,
      reachability: 95,
      competition: 80,
    },
    tier: "high",
    status: "new",
    dedupe_key: "covingtonsupplyco.com",
    source_url: "https://covingtonsupplyco.com/product/wood-composite-wpc-decking-for-wholesale/",
    match_reason:
      "美国建材批发商，网站提供 Wood Composite WPC Decking for Wholesale，明确批发定位。",
    contacts: [{ type: "email", value: "info@covingtonsupplyco.com", confidence: "high" }],
    people: [],
    round: "R1",
    query_id: "q_016",
    discovered_at: "2026-07-12T11:23:34.186Z",
  };
}

test("draftEmailForLead creates short and professional variants with evidence", () => {
  const root = createTempProject();
  const productId = "prod_email_test";

  try {
    const profile = saveProfile(
      root,
      {
        company: {
          name: "GreenSen WPC Co., Ltd.",
          website: "https://lvsen.test",
          country: "CN",
          certifications: ["ISO9001", "CE"],
        },
        products: [
          {
            name: "WPC Decking",
            name_en: "WPC Decking",
            differentiators: ["Second-generation co-extrusion technology", "60,000+ tons annual capacity"],
          },
        ],
      },
      productId
    ).profile;

    const draft = draftEmailForLead(root, profile, sampleScoredLead(), productId);

    assert.equal(draft.variants.length, 2);
    assert.ok(draft.variants.some((variant) => variant.type === "short"));
    assert.ok(draft.variants.some((variant) => variant.type === "professional"));
    assert.ok(draft.personalization_evidence.length >= 1);
    assert.ok(draft.variants[0]?.subject.length > 0);
    assert.ok(draft.variants[0]?.body.includes("WPC Decking"));
    assert.ok(draft.recipient?.email === "info@covingtonsupplyco.com");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateEmailDraftsForProduct writes draft files and updates lead status", () => {
  const root = createTempProject();
  const productId = "prod_email_test";

  try {
    saveProfile(
      root,
      {
        company: { name: "GreenSen WPC", website: "https://lvsen.test", country: "CN" },
        products: [{ name_en: "WPC Decking", differentiators: ["Own factory"] }],
      },
      productId
    );

    saveScoredLeads(root, {
      product_id: productId,
      updated_at: new Date().toISOString(),
      leads: [sampleScoredLead()],
      stats: { total: 1, by_tier: { high: 1, medium: 0, low: 0 }, by_status: { new: 1 } },
    });

    const result = generateEmailDraftsForProduct(root, productId, { limit: 5 });
    assert.equal(result.drafts.length, 1);

    const draft = loadEmailDraft(root, "lead_20260712_0011");
    assert.ok(draft);
    assert.equal(draft?.status, "pending_review");

    const markdownPath = join(root, "data", "emails", "lead_20260712_0011", "draft.md");
    assert.ok(existsSync(markdownPath));
    assert.ok(readFileSync(markdownPath, "utf8").includes("Personalization Evidence"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saveEmailDraft persists markdown review file", () => {
  const root = createTempProject();
  try {
    const draft = saveEmailDraft(root, "lead_test_md", {
      id: "email_test_001",
      lead_id: "lead_test_md",
      product_id: "prod_x",
      status: "pending_review",
      language: "en",
      variants: [
        { type: "short", subject: "Test", body: "Hello world" },
        { type: "professional", subject: "Test Pro", body: "Hello professional" },
      ],
      personalization_evidence: ["Evidence 1"],
      selected_variant: null,
      review: { approved: null, reviewer_notes: null, reviewed_at: null },
    });

    const md = renderEmailDraftMarkdown(draft);
    assert.ok(md.includes("Variant: short"));
    assert.ok(md.includes("Evidence 1"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
