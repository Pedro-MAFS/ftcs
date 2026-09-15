import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ScoredLead } from "./lead-types.js";
import type { EmailDraft, EmailDraftInput } from "./email-types.js";
import { EmailDraftSchema } from "./email-types.js";
import { draftEmailForLead, renderEmailDraftMarkdown, validateDraftWordLimits } from "./email-drafter.js";
import {
  getEmailDraftMarkdownPath,
  getEmailDraftPath,
  getEmailsDir,
} from "./paths.js";
import { loadProfile } from "./storage.js";
import { loadScoredLeads, saveScoredLeads } from "./lead-storage.js";
import { buildScoredStats } from "./lead-scorer.js";

export function loadEmailDraft(root: string, leadId: string): EmailDraft | null {
  const draftPath = getEmailDraftPath(root, leadId);
  if (!existsSync(draftPath)) {
    return null;
  }
  return EmailDraftSchema.parse(JSON.parse(readFileSync(draftPath, "utf8")));
}

export function saveEmailDraft(
  root: string,
  leadId: string,
  input: EmailDraftInput,
  writeMarkdown = true
): EmailDraft {
  const draft: EmailDraft = EmailDraftSchema.parse({
    ...input,
    id: input.id ?? input.lead_id,
    lead_id: leadId,
    created_at: input.created_at ?? new Date().toISOString(),
  });

  validateDraftWordLimits(draft);

  const draftPath = getEmailDraftPath(root, leadId);
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (writeMarkdown) {
    const markdownPath = getEmailDraftMarkdownPath(root, leadId);
    writeFileSync(markdownPath, renderEmailDraftMarkdown(draft), "utf8");
  }

  return draft;
}

export function listEmailDrafts(root: string, productId?: string): EmailDraft[] {
  const baseDir = getEmailsDir(root);
  if (!existsSync(baseDir)) {
    return [];
  }

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadEmailDraft(root, entry.name))
    .filter((draft): draft is EmailDraft => draft !== null)
    .filter((draft) => (productId ? draft.product_id === productId : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function selectLeadsForEmailDraft(
  leads: ScoredLead[],
  leadIds?: string[],
  limit = 5
): ScoredLead[] {
  if (leadIds && leadIds.length > 0) {
    return leads.filter((lead) => leadIds.includes(lead.id)).slice(0, limit);
  }

  return leads
    .filter((lead) => lead.status === "new")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function generateEmailDraftsForProduct(
  root: string,
  productId: string,
  options?: {
    lead_ids?: string[];
    limit?: number;
    write_markdown?: boolean;
  }
): {
  drafts: EmailDraft[];
  skipped: Array<{ lead_id: string; reason: string }>;
} {
  const profile = loadProfile(root, productId);
  if (!profile) {
    throw new Error(`Product not found: ${productId}`);
  }

  const scored = loadScoredLeads(root, productId);
  if (!scored || scored.leads.length === 0) {
    throw new Error(`No scored leads found for product: ${productId}`);
  }

  const limit = options?.limit ?? 5;
  const targets = selectLeadsForEmailDraft(scored.leads, options?.lead_ids, limit);
  const drafts: EmailDraft[] = [];
  const skipped: Array<{ lead_id: string; reason: string }> = [];

  for (const lead of targets) {
    if (loadEmailDraft(root, lead.id) && !options?.lead_ids) {
      skipped.push({ lead_id: lead.id, reason: "draft_already_exists" });
      continue;
    }

    const draft = draftEmailForLead(root, profile, lead, productId);
    saveEmailDraft(root, lead.id, draft, options?.write_markdown ?? true);
    updateLeadStatusInScored(root, productId, lead.id, "email_drafted");
    drafts.push(draft);
  }

  return { drafts, skipped };
}

export function buildDraftSummary(draft: EmailDraft): {
  lead_id: string;
  company: string | undefined;
  subject: string;
  recipient: string | undefined;
} {
  const shortVariant = draft.variants.find((variant) => variant.type === "short") ?? draft.variants[0];
  return {
    lead_id: draft.lead_id,
    company: draft.recipient?.company,
    subject: shortVariant?.subject ?? "",
    recipient: draft.recipient?.email,
  };
}

export function updateLeadStatusInScored(
  root: string,
  productId: string,
  leadId: string,
  status: ScoredLead["status"]
): ScoredLead | null {
  const scored = loadScoredLeads(root, productId);
  if (!scored) {
    return null;
  }

  const lead = scored.leads.find((item) => item.id === leadId);
  if (!lead) {
    return null;
  }

  lead.status = status;
  scored.updated_at = new Date().toISOString();
  scored.stats = buildScoredStats(scored.leads);
  saveScoredLeads(root, scored);
  return lead;
}
