import type { ProductProfile } from "./profile-types.js";
import type { ScoredLead } from "./lead-types.js";
import type { EmailDraft } from "./email-types.js";
import { generateEmailId, pickPrimaryEmail, resolveEmailLanguage } from "./email-id.js";

function primaryProduct(profile: ProductProfile) {
  return profile.products[0];
}

function sellerName(profile: ProductProfile): string {
  return profile.company.name ?? "Our company";
}

function productLabel(profile: ProductProfile): string {
  const product = primaryProduct(profile);
  return product?.name_en ?? product?.name ?? "our products";
}

function topDifferentiators(profile: ProductProfile, limit = 2): string[] {
  const product = primaryProduct(profile);
  return (product?.differentiators ?? []).slice(0, limit);
}

function certifications(profile: ProductProfile): string {
  const certs = profile.company.certifications ?? [];
  return certs.length > 0 ? certs.join(", ") : "ISO9001";
}

function greeting(lead: ScoredLead): string {
  const name = lead.company.name?.trim();
  return name ? `Dear ${name} Team,` : "Dear Team,";
}

function buildPersonalizationEvidence(lead: ScoredLead): string[] {
  const evidence = [lead.match_reason];
  if (lead.company.description) {
    evidence.push(lead.company.description);
  }
  if (lead.source_url) {
    evidence.push(`Source page: ${lead.source_url}`);
  }
  return evidence.filter(Boolean);
}

function extractPersonalizationHook(lead: ScoredLead): string {
  if (lead.match_reason) {
    return lead.match_reason;
  }
  if (lead.company.description) {
    return lead.company.description;
  }
  return "your business aligns with our product line";
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function buildProfessionalBody(
  profile: ProductProfile,
  lead: ScoredLead
): { subject: string; body: string } {
  const product = productLabel(profile);
  const seller = sellerName(profile);
  const hook = extractPersonalizationHook(lead);
  const diffs = topDifferentiators(profile, 2);
  const certText = certifications(profile);
  const website = profile.company.website ?? "";

  const body = [
    greeting(lead),
    "",
    `I hope this message finds you well. While reviewing companies in your segment, I noticed ${hook}.`,
    "",
    `${seller} has been manufacturing ${product} for global export markets. Our key strengths include:`,
    ...diffs.map((item) => `- ${item}`),
    "",
    `Our products are backed by ${certText}, and we support flexible cooperation models including OEM/ODM and long-term supply programs.`,
    website ? `Learn more about us: ${website}` : "",
    "",
    "If you are sourcing for upcoming projects, I would appreciate the chance to share our catalog, MOQ, and lead time options.",
    "",
    "Could we schedule a 15-minute call, or would you prefer a quotation by email first?",
    "",
    "Best regards,",
    seller,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Partnership Inquiry: ${product} from ${seller}`,
    body: trimToWordLimit(body, 200),
  };
}

export function draftEmailForLead(
  root: string,
  profile: ProductProfile,
  lead: ScoredLead,
  productId: string
): EmailDraft {
  const now = new Date().toISOString();
  const { subject, body } = buildProfessionalBody(profile, lead);

  return {
    id: generateEmailId(root),
    lead_id: lead.id,
    product_id: productId,
    created_at: now,
    updated_at: now,
    status: "pending_review",
    language: resolveEmailLanguage(lead.company.country),
    audience: "company",
    subject,
    body,
    subject_zh: null,
    body_zh: null,
    style_prompt: null,
    personalization_evidence: buildPersonalizationEvidence(lead),
    review: {
      approved: null,
      reviewer_notes: null,
      reviewed_at: null,
    },
    recipient: {
      company: lead.company.name,
      email: pickPrimaryEmail(lead.contacts) || undefined,
      name: null,
    },
  };
}

export function renderEmailDraftMarkdown(draft: EmailDraft): string {
  const lines = [
    `# Email Draft: ${draft.recipient?.company ?? draft.lead_id}`,
    "",
    `- Draft ID: ${draft.id}`,
    `- Lead ID: ${draft.lead_id}`,
    `- Product ID: ${draft.product_id}`,
    `- Status: ${draft.status}`,
    `- Audience: ${draft.audience}`,
    `- Language: ${draft.language}`,
    `- Recipient: ${draft.recipient?.email ?? "N/A"}`,
    "",
    "## Personalization Evidence",
    ...draft.personalization_evidence.map((item) => `- ${item}`),
    "",
    "## Subject",
    "",
    draft.subject,
    "",
    "## Body",
    "",
    draft.body,
    "",
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function validateDraftWordLimits(draft: EmailDraft): void {
  const count = wordCount(draft.body);
  const limit = 200;
  if (count > limit + 5) {
    throw new Error(`Draft body exceeds word limit (${count}/${limit})`);
  }
}
