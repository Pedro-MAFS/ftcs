import type { ProductProfile } from "./profile-types.js";
import type { ScoredLead } from "./lead-types.js";
import type { EmailDraft, EmailVariant } from "./email-types.js";
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

function buildShortVariant(profile: ProductProfile, lead: ScoredLead): EmailVariant {
  const product = productLabel(profile);
  const seller = sellerName(profile);
  const hook = extractPersonalizationHook(lead);
  const diffs = topDifferentiators(profile, 1);
  const diffText = diffs[0] ? ` ${diffs[0]}.` : "";

  const body = [
    greeting(lead),
    "",
    `I came across your company and noticed ${hook}.`,
    "",
    `We are ${seller}, a manufacturer specializing in ${product}.${diffText} We support OEM/ODM and stable export supply.`,
    "",
    "Would you be open to a quick call this week to discuss pricing and lead time for your market?",
    "",
    "Best regards,",
    seller,
  ].join("\n");

  return {
    type: "short",
    subject: `${product} Supply Partnership - Stable Delivery`,
    body: trimToWordLimit(body, 120),
  };
}

function buildProfessionalVariant(profile: ProductProfile, lead: ScoredLead): EmailVariant {
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
    type: "professional",
    subject: `Partnership Inquiry: ${product} from ${seller}`,
    body: trimToWordLimit(body, 200),
  };
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}

export function draftEmailForLead(
  root: string,
  profile: ProductProfile,
  lead: ScoredLead,
  productId: string
): EmailDraft {
  const variants = [buildShortVariant(profile, lead), buildProfessionalVariant(profile, lead)];

  return {
    id: generateEmailId(root),
    lead_id: lead.id,
    product_id: productId,
    created_at: new Date().toISOString(),
    status: "pending_review",
    language: resolveEmailLanguage(lead.company.country),
    variants,
    personalization_evidence: buildPersonalizationEvidence(lead),
    selected_variant: null,
    review: {
      approved: null,
      reviewer_notes: null,
      reviewed_at: null,
    },
    recipient: {
      company: lead.company.name,
      email: pickPrimaryEmail(lead.contacts),
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
    `- Language: ${draft.language}`,
    `- Recipient: ${draft.recipient?.email ?? "N/A"}`,
    "",
    "## Personalization Evidence",
    ...draft.personalization_evidence.map((item) => `- ${item}`),
    "",
  ];

  for (const variant of draft.variants) {
    lines.push(`## Variant: ${variant.type}`);
    lines.push("");
    lines.push(`**Subject:** ${variant.subject}`);
    lines.push("");
    lines.push(variant.body);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function validateDraftWordLimits(draft: EmailDraft): void {
  for (const variant of draft.variants) {
    const count = wordCount(variant.body);
    const limit = variant.type === "short" ? 120 : 200;
    if (count > limit + 5) {
      throw new Error(`Variant ${variant.type} exceeds word limit (${count}/${limit})`);
    }
  }
}
