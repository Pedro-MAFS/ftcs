import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_EMAIL_LOCAL_PARTS,
  MAX_PERSON_DRAFT_SLOTS,
  classifyEmailAudience,
  isGenericEmail,
  weakParseLocalName,
} from "./email-contact-classify.js";
import { planDraftSlots, planSingleSlot } from "./email-draft-plan.js";
import type { ScoredLead } from "./lead-types.js";

function baseLead(overrides: Partial<ScoredLead> = {}): ScoredLead {
  return {
    id: "lead_test_001",
    company: {
      name: "Acme Corp",
      website: "https://acme.example/",
      country: "US",
    },
    score: 80,
    score_breakdown: {
      product_match: 80,
      purchase_intent: 80,
      size_fit: 80,
      geo_match: 80,
      reachability: 80,
      competition: 80,
    },
    tier: "high",
    status: "new",
    dedupe_key: "acme.example",
    source_url: "https://acme.example/",
    match_reason: "wholesale buyer",
    contacts: [],
    people: [],
    ...overrides,
  };
}

test("classify generic vs person", () => {
  assert.equal(classifyEmailAudience("info@x.com"), "company");
  assert.equal(classifyEmailAudience("Sales@X.com"), "company");
  assert.equal(isGenericEmail("buyer@x.com"), true);
  assert.equal(classifyEmailAudience("erik@x.com"), "person");
  assert.equal(classifyEmailAudience("not-an-email"), null);
  assert.ok(GENERIC_EMAIL_LOCAL_PARTS.has("purchasing"));
});

test("weakParseLocalName", () => {
  assert.equal(weakParseLocalName("john.smith"), "John");
  assert.equal(weakParseLocalName("a"), null);
  assert.equal(weakParseLocalName("123abc"), null);
});

test("planDraftSlots 1+N with info and persons", () => {
  const lead = baseLead({
    contacts: [
      { type: "email", value: "info@acme.example", confidence: "high" },
      { type: "email", value: "erik@acme.example", confidence: "medium" },
      { type: "email", value: "ann@acme.example", confidence: "high" },
    ],
  });
  const plan = planDraftSlots(lead, "prod_1");
  assert.equal(plan.company.email, "info@acme.example");
  assert.equal(plan.persons.length, 2);
  assert.equal(plan.truncated_person_count, 0);
  const erik = plan.persons.find((p) => p.email === "erik@acme.example");
  assert.equal(erik?.greeting_line, "Dear Erik,");
  assert.ok(plan.company.greeting_line.includes("Acme Corp"));
});

test("planDraftSlots company email empty when only persons", () => {
  const plan = planDraftSlots(
    baseLead({
      contacts: [
        { type: "email", value: "erik@acme.example", confidence: "high" },
      ],
    }),
    "prod_1"
  );
  assert.equal(plan.company.email, undefined);
  assert.equal(plan.persons.length, 1);
  assert.notEqual(plan.persons[0]?.email, plan.company.email);
});

test("planDraftSlots caps persons at 5", () => {
  const contacts = Array.from({ length: 6 }, (_, i) => ({
    type: "email" as const,
    value: `u${i}@acme.example`,
    confidence: "medium" as const,
  }));
  const plan = planDraftSlots(baseLead({ contacts }), "prod_1");
  assert.equal(plan.persons.length, MAX_PERSON_DRAFT_SLOTS);
  assert.equal(plan.truncated_person_count, 1);
});

test("planSingleSlot people-only person", () => {
  const lead = baseLead({ contacts: [] });
  const result = planSingleSlot(lead, "prod_1", {
    audience: "person",
    email: "only.people@acme.example",
  });
  assert.equal(result.slot.audience, "person");
  assert.equal(result.slot.email, "only.people@acme.example");
  assert.ok(String(result.slot.draft_path).includes("only.people_at_acme.example"));
});
