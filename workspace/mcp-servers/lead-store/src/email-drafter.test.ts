import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { draftEmailForLead, renderEmailDraftMarkdown } from "./email-drafter.js";
import {
  generateEmailDraftsForProduct,
  loadEmailDraft,
  saveEmailDraft,
  saveEmailDraftSlot,
  selectLeadsForEmailDraft,
  listEmailDraftSlots,
} from "./email-storage.js";
import { migrateEmailDraftFile, needsMigration } from "./email-draft-migrate.js";
import { recipientKeyFromEmail } from "./email-recipient-key.js";
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

test("recipientKeyFromEmail is stable and avoids company reserved word", () => {
  assert.equal(recipientKeyFromEmail("Erik.L@NordicGear.se"), "erik.l_at_nordicgear.se");
  assert.equal(recipientKeyFromEmail(" erik.l@nordicgear.se "), "erik.l_at_nordicgear.se");
  assert.ok(recipientKeyFromEmail("company@x.com"));
  assert.notEqual(recipientKeyFromEmail("company@x.com"), "company");
  assert.equal(recipientKeyFromEmail("not-an-email"), null);
});

test("draftEmailForLead creates single-body company draft", () => {
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

    assert.equal(draft.audience, "company");
    assert.ok(draft.subject.length > 0);
    assert.ok(draft.body.includes("WPC Decking"));
    assert.ok(draft.personalization_evidence.length >= 1);
    assert.equal(draft.recipient?.email, "info@covingtonsupplyco.com");
    assert.equal((draft as { variants?: unknown }).variants, undefined);
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
    assert.equal(draft?.audience, "company");
    assert.ok(draft?.subject);
    assert.ok(!("variants" in (JSON.parse(
      readFileSync(join(root, "data", "emails", "lead_20260712_0011", "draft.json"), "utf8")
    ) as object)));

    const markdownPath = join(root, "data", "emails", "lead_20260712_0011", "draft.md");
    assert.ok(existsSync(markdownPath));
    assert.ok(readFileSync(markdownPath, "utf8").includes("Personalization Evidence"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selectLeadsForEmailDraft defaults to status=new by score, any tier", () => {
  const high = { ...sampleScoredLead(), id: "lead_h", tier: "high" as const, score: 80 };
  const medium = {
    ...sampleScoredLead(),
    id: "lead_m",
    tier: "medium" as const,
    score: 90,
    status: "new" as const,
  };
  const drafted = {
    ...sampleScoredLead(),
    id: "lead_d",
    tier: "high" as const,
    score: 99,
    status: "email_drafted" as const,
  };
  const picked = selectLeadsForEmailDraft([high, medium, drafted], undefined, 5);
  assert.deepEqual(
    picked.map((l) => l.id),
    ["lead_m", "lead_h"],
  );
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
      audience: "company",
      subject: "Test Pro",
      body: "Hello professional",
      personalization_evidence: ["Evidence 1"],
      review: { approved: null, reviewer_notes: null, reviewed_at: null },
    });

    const md = renderEmailDraftMarkdown(draft);
    assert.ok(md.includes("## Subject"));
    assert.ok(md.includes("Test Pro"));
    assert.ok(md.includes("Evidence 1"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migrate legacy dual-variant draft keeps professional as company", () => {
  const root = createTempProject();
  const leadId = "lead_legacy_001";
  const draftPath = join(root, "data", "emails", leadId, "draft.json");
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(
    draftPath,
    JSON.stringify(
      {
        id: "email_legacy",
        lead_id: leadId,
        product_id: "prod_x",
        created_at: "2026-01-01T00:00:00.000Z",
        status: "pending_review",
        language: "en",
        variants: [
          { type: "short", subject: "Short Sub", body: "Short body" },
          { type: "professional", subject: "Pro Sub", body: "Professional body text" },
        ],
        personalization_evidence: ["ev"],
        selected_variant: "short",
        review: { approved: null, reviewer_notes: null, reviewed_at: null },
        recipient: { company: "Acme", email: "info@acme.test" },
      },
      null,
      2
    ),
    "utf8"
  );
  writeFileSync(join(dirname(draftPath), "draft.md"), "# old\n", "utf8");

  try {
    assert.equal(needsMigration(JSON.parse(readFileSync(draftPath, "utf8"))), true);
    const result = migrateEmailDraftFile(draftPath, "company");
    assert.equal(result.status, "migrated");
    if (result.status === "migrated") {
      assert.equal(result.backedUp, true);
    }

    const backupPath = `${draftPath}.pre-m01`;
    assert.ok(existsSync(backupPath));
    const backup = JSON.parse(readFileSync(backupPath, "utf8")) as Record<string, unknown>;
    assert.ok(Array.isArray(backup.variants));
    assert.equal((backup.variants as unknown[]).length, 2);
    assert.ok(existsSync(join(dirname(draftPath), "draft.md.pre-m01")));

    const next = JSON.parse(readFileSync(draftPath, "utf8")) as Record<string, unknown>;
    assert.equal(next.subject, "Pro Sub");
    assert.equal(next.body, "Professional body text");
    assert.equal(next.audience, "company");
    assert.ok(!("variants" in next));
    assert.ok(!("selected_variant" in next));
    assert.equal(next.created_at, "2026-01-01T00:00:00.000Z");

    const again = migrateEmailDraftFile(draftPath, "company");
    assert.equal(again.status, "skipped");
    // 再次迁移不会覆盖备份
    const backupAgain = JSON.parse(readFileSync(backupPath, "utf8")) as Record<string, unknown>;
    assert.ok(Array.isArray(backupAgain.variants));

    const loaded = loadEmailDraft(root, leadId);
    assert.equal(loaded?.subject, "Pro Sub");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("person slot saves under recipient_key subdirectory", () => {
  const root = createTempProject();
  try {
    const key = recipientKeyFromEmail("erik.l@nordicgear.se");
    assert.ok(key);
    saveEmailDraftSlot(
      root,
      "lead_person_1",
      { kind: "person", recipientKey: key! },
      {
        lead_id: "lead_person_1",
        product_id: "prod_x",
        status: "pending_review",
        language: "en",
        audience: "person",
        subject: "Hi Erik",
        body: "Hello Erik",
        recipient: { company: "Nordic", email: "erik.l@nordicgear.se", name: "Erik" },
        personalization_evidence: [],
        review: { approved: null, reviewer_notes: null, reviewed_at: null },
      }
    );

    const path = join(root, "data", "emails", "lead_person_1", key!, "draft.json");
    assert.ok(existsSync(path));
    const slots = listEmailDraftSlots(root, "lead_person_1");
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.audience, "person");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
