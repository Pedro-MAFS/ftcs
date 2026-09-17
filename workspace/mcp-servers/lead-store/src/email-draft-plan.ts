import type { ScoredLead } from "./lead-types.js";
import { COMPANY_RECIPIENT_KEY } from "./email-types.js";
import { normalizeEmail, recipientKeyFromEmail } from "./email-recipient-key.js";
import { resolveEmailLanguage } from "./email-id.js";
import {
  MAX_PERSON_DRAFT_SLOTS,
  classifyEmailAudience,
  confidenceWeight,
  emailLocalPart,
  weakParseLocalName,
} from "./email-contact-classify.js";

export type PlannedCompanySlot = {
  kind: "company";
  recipient_key: typeof COMPANY_RECIPIENT_KEY;
  email?: string;
  aliases: string[];
  greeting_line: string;
  draft_path: string;
  company_name?: string;
};

export type PlannedPersonSlot = {
  kind: "person";
  recipient_key: string;
  email: string;
  greeting_line: string;
  display_name: string | null;
  draft_path: string;
};

export type DraftSlotPlan = {
  lead_id: string;
  product_id: string;
  company: PlannedCompanySlot;
  persons: PlannedPersonSlot[];
  truncated_person_count: number;
  personalization_hints: string[];
  language: string;
};

type ContactEmail = {
  email: string;
  confidence?: string;
  audience: "company" | "person";
};

function sortByConfidenceThenEmail(a: ContactEmail, b: ContactEmail): number {
  const w = confidenceWeight(b.confidence) - confidenceWeight(a.confidence);
  if (w !== 0) return w;
  return a.email.localeCompare(b.email);
}

function collectContactEmails(lead: ScoredLead): ContactEmail[] {
  const byEmail = new Map<string, ContactEmail>();
  for (const contact of lead.contacts ?? []) {
    if (contact.type !== "email") continue;
    const email = normalizeEmail(contact.value);
    if (!email) continue;
    const audience = classifyEmailAudience(email);
    if (!audience) continue;
    const prev = byEmail.get(email);
    if (
      !prev ||
      confidenceWeight(contact.confidence) > confidenceWeight(prev.confidence)
    ) {
      byEmail.set(email, {
        email,
        confidence: contact.confidence,
        audience,
      });
    }
  }
  return [...byEmail.values()];
}

function findPeopleFirstName(lead: ScoredLead, email: string): string | null {
  const people = lead.people ?? [];
  const hit = people.find((p) => normalizeEmail(p.email) === email);
  const first = hit?.first_name?.trim();
  if (first) return first;
  const name = hit?.name?.trim();
  if (name) {
    const part = name.split(/\s+/)[0];
    if (part && part.length >= 2) return part;
  }
  return null;
}

function companyGreeting(companyName?: string): string {
  const name = companyName?.trim();
  return name ? `Dear ${name} Team,` : "Dear Team,";
}

function personGreeting(lead: ScoredLead, email: string): {
  greeting_line: string;
  display_name: string | null;
} {
  const fromPeople = findPeopleFirstName(lead, email);
  if (fromPeople) {
    return {
      greeting_line: `Dear ${fromPeople},`,
      display_name: fromPeople,
    };
  }
  const local = emailLocalPart(email);
  const weak = local ? weakParseLocalName(local) : null;
  if (weak) {
    return { greeting_line: `Dear ${weak},`, display_name: weak };
  }
  return { greeting_line: "Hello,", display_name: null };
}

function buildPersonalizationHints(lead: ScoredLead): string[] {
  const hints = [lead.match_reason];
  if (lead.company.description) hints.push(lead.company.description);
  if (lead.source_url) hints.push(`Source page: ${lead.source_url}`);
  return hints.filter(Boolean);
}

export function planDraftSlots(lead: ScoredLead, productId: string): DraftSlotPlan {
  const contacts = collectContactEmails(lead);
  const generics = contacts
    .filter((c) => c.audience === "company")
    .sort(sortByConfidenceThenEmail);
  const personals = contacts
    .filter((c) => c.audience === "person")
    .sort(sortByConfidenceThenEmail);

  const companyEmail = generics[0]?.email;
  const aliases = generics.slice(1).map((c) => c.email);
  const truncated = Math.max(0, personals.length - MAX_PERSON_DRAFT_SLOTS);
  const selectedPersons = personals.slice(0, MAX_PERSON_DRAFT_SLOTS);

  const companyName = lead.company.name;
  const company: PlannedCompanySlot = {
    kind: "company",
    recipient_key: COMPANY_RECIPIENT_KEY,
    email: companyEmail,
    aliases,
    greeting_line: companyGreeting(companyName),
    draft_path: `data/emails/${lead.id}/draft.json`,
    company_name: companyName,
  };

  const persons: PlannedPersonSlot[] = selectedPersons.map((item) => {
    const key = recipientKeyFromEmail(item.email);
    if (!key) {
      throw new Error(`Invalid person email for recipient_key: ${item.email}`);
    }
    const greeting = personGreeting(lead, item.email);
    return {
      kind: "person",
      recipient_key: key,
      email: item.email,
      greeting_line: greeting.greeting_line,
      display_name: greeting.display_name,
      draft_path: `data/emails/${lead.id}/${key}/draft.json`,
    };
  });

  return {
    lead_id: lead.id,
    product_id: productId,
    company,
    persons,
    truncated_person_count: truncated,
    personalization_hints: buildPersonalizationHints(lead),
    language: resolveEmailLanguage(lead.company.country),
  };
}

/** 将 plan 展平为 MCP 返回的 slots[] */
export function flattenPlanSlots(plan: DraftSlotPlan): Array<Record<string, unknown>> {
  const companySlot: Record<string, unknown> = {
    audience: "company",
    recipient_key: plan.company.recipient_key,
    email: plan.company.email ?? null,
    aliases: plan.company.aliases,
    greeting_line: plan.company.greeting_line,
    draft_path: plan.company.draft_path,
    company_name: plan.company.company_name ?? null,
  };
  const personSlots = plan.persons.map((p) => ({
    audience: "person" as const,
    recipient_key: p.recipient_key,
    email: p.email,
    greeting_line: p.greeting_line,
    display_name: p.display_name,
    draft_path: p.draft_path,
  }));
  return [companySlot, ...personSlots];
}

export function planSingleSlot(
  lead: ScoredLead,
  productId: string,
  options: {
    audience: "company" | "person";
    email?: string;
    recipient_key?: string;
  }
): {
  lead_id: string;
  product_id: string;
  language: string;
  personalization_hints: string[];
  slot: Record<string, unknown>;
} {
  const baseHints = buildPersonalizationHints(lead);
  const language = resolveEmailLanguage(lead.company.country);

  if (options.audience === "company") {
    const full = planDraftSlots(lead, productId);
    let email = full.company.email;
    let aliases = full.company.aliases;
    if (options.email) {
      const normalized = normalizeEmail(options.email);
      if (!normalized) {
        throw new Error(`Invalid email: ${options.email}`);
      }
      email = normalized;
      aliases = full.company.aliases.filter((a) => a !== normalized);
    }
    return {
      lead_id: lead.id,
      product_id: productId,
      language,
      personalization_hints: baseHints,
      slot: {
        audience: "company",
        recipient_key: COMPANY_RECIPIENT_KEY,
        email: email ?? null,
        aliases,
        greeting_line: companyGreeting(lead.company.name),
        draft_path: `data/emails/${lead.id}/draft.json`,
        company_name: lead.company.name ?? null,
      },
    };
  }

  const rawEmail = options.email;
  if (!rawEmail) {
    throw new Error("person audience requires email");
  }
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new Error(`Invalid email: ${rawEmail}`);
  }
  const key =
    options.recipient_key?.trim() ||
    recipientKeyFromEmail(email);
  if (!key || key === COMPANY_RECIPIENT_KEY) {
    throw new Error("Unable to derive recipient_key for person slot");
  }
  const greeting = personGreeting(lead, email);
  return {
    lead_id: lead.id,
    product_id: productId,
    language,
    personalization_hints: baseHints,
    slot: {
      audience: "person",
      recipient_key: key,
      email,
      greeting_line: greeting.greeting_line,
      display_name: greeting.display_name,
      draft_path: `data/emails/${lead.id}/${key}/draft.json`,
    },
  };
}
