import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ScoredLead } from "./lead-types.js";
import type { EmailDraft, EmailDraftInput, EmailDraftSlot } from "./email-types.js";
import {
  COMPANY_RECIPIENT_KEY,
  EmailDraftSchema,
  recipientKeyFromSlot,
  slotFromRecipientKey,
} from "./email-types.js";
import { renderEmailDraftMarkdown, validateDraftWordLimits } from "./email-drafter.js";
import {
  getEmailDraftMarkdownPathForSlot,
  getEmailDraftPathForSlot,
  getEmailsDir,
} from "./paths.js";
import { migrateEmailDraftFile, migrateEmailDraftsIfNeeded } from "./email-draft-migrate.js";
import { loadProfile } from "./storage.js";
import { loadScoredLeads, saveScoredLeads } from "./lead-storage.js";
import { buildScoredStats } from "./lead-scorer.js";
import { generateEmailId } from "./email-id.js";
import {
  flattenPlanSlots,
  planDraftSlots,
  planSingleSlot,
  type DraftSlotPlan,
} from "./email-draft-plan.js";

export type EmailDraftSlotSummary = {
  slot: EmailDraftSlot;
  recipient_key: string;
  audience: EmailDraft["audience"];
  email?: string;
  name?: string | null;
  subject: string;
  status: EmailDraft["status"];
  draft_path: string;
  created_at: string;
};

export type EmailDraftLeadSummary = {
  lead_id: string;
  product_id: string;
  company_name?: string;
  has_company_draft: boolean;
  person_draft_count: number;
  draft_count: number;
  status: EmailDraft["status"];
  newest_created_at: string;
  representative_path: string;
  subject: string;
  recipient_email?: string;
  slots: EmailDraftSlotSummary[];
};

function relativeDraftPath(leadId: string, slot: EmailDraftSlot): string {
  if (slot.kind === "company") {
    return `data/emails/${leadId}/draft.json`;
  }
  return `data/emails/${leadId}/${slot.recipientKey}/draft.json`;
}

function ensureMigrated(filePath: string, pathHint: "company" | "person"): void {
  if (!existsSync(filePath)) return;
  migrateEmailDraftFile(filePath, pathHint, {
    rewriteMarkdown: existsSync(filePath.replace(/draft\.json$/i, "draft.md")),
  });
}

export function loadEmailDraftSlot(
  root: string,
  leadId: string,
  slot: EmailDraftSlot = { kind: "company" }
): EmailDraft | null {
  const draftPath = getEmailDraftPathForSlot(root, leadId, slot);
  if (!existsSync(draftPath)) return null;

  ensureMigrated(draftPath, slot.kind === "company" ? "company" : "person");

  try {
    return EmailDraftSchema.parse(JSON.parse(readFileSync(draftPath, "utf8")));
  } catch {
    return null;
  }
}

export function loadEmailDraft(root: string, leadId: string): EmailDraft | null {
  return loadEmailDraftSlot(root, leadId, { kind: "company" });
}

export function saveEmailDraftSlot(
  root: string,
  leadId: string,
  slot: EmailDraftSlot,
  input: EmailDraftInput | Record<string, unknown>,
  writeMarkdown = true
): EmailDraft {
  const now = new Date().toISOString();
  const existing = existsSync(getEmailDraftPathForSlot(root, leadId, slot))
    ? loadEmailDraftSlot(root, leadId, slot)
    : null;

  const raw = input as Record<string, unknown>;
  let subject = typeof raw.subject === "string" ? raw.subject : "";
  let body = typeof raw.body === "string" ? raw.body : "";
  if ((!subject || !body) && Array.isArray(raw.variants)) {
    const variants = raw.variants as Array<Record<string, unknown>>;
    const pro =
      variants.find((v) => v?.type === "professional") ?? variants[0] ?? null;
    if (pro) {
      subject = typeof pro.subject === "string" ? pro.subject : subject;
      body = typeof pro.body === "string" ? pro.body : body;
    }
  }

  const audience =
    (raw.audience === "person" || raw.audience === "company"
      ? raw.audience
      : undefined) ?? (slot.kind === "company" ? "company" : "person");

  const styleRaw = raw.style_prompt;
  const style_prompt =
    typeof styleRaw === "string"
      ? styleRaw.trim() || null
      : styleRaw === null
        ? null
        : (existing?.style_prompt ?? null);

  const subject_zh =
    raw.subject_zh === undefined
      ? (existing?.subject_zh ?? null)
      : raw.subject_zh === null || raw.subject_zh === ""
        ? null
        : String(raw.subject_zh);
  const body_zh =
    raw.body_zh === undefined
      ? (existing?.body_zh ?? null)
      : raw.body_zh === null || raw.body_zh === ""
        ? null
        : String(raw.body_zh);
  const zh_source_hash =
    raw.zh_source_hash === undefined
      ? (existing?.zh_source_hash ?? null)
      : raw.zh_source_hash === null || raw.zh_source_hash === ""
        ? null
        : String(raw.zh_source_hash);

  const draft: EmailDraft = EmailDraftSchema.parse({
    ...raw,
    id:
      (typeof raw.id === "string" ? raw.id : undefined) ??
      existing?.id ??
      generateEmailId(root),
    lead_id: leadId,
    product_id: typeof raw.product_id === "string" ? raw.product_id : existing?.product_id,
    created_at:
      (typeof raw.created_at === "string" ? raw.created_at : undefined) ??
      existing?.created_at ??
      now,
    updated_at: now,
    status: raw.status ?? existing?.status ?? "pending_review",
    language: typeof raw.language === "string" ? raw.language : existing?.language ?? "en",
    audience: slot.kind === "company" ? "company" : audience,
    recipient: raw.recipient ?? existing?.recipient,
    subject,
    body,
    subject_zh,
    body_zh,
    zh_source_hash,
    style_prompt,
    personalization_evidence: Array.isArray(raw.personalization_evidence)
      ? raw.personalization_evidence
      : existing?.personalization_evidence ?? [],
    review: raw.review ?? existing?.review,
  });

  validateDraftWordLimits(draft);

  const draftPath = getEmailDraftPathForSlot(root, leadId, slot);
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  if (writeMarkdown) {
    const markdownPath = getEmailDraftMarkdownPathForSlot(root, leadId, slot);
    writeFileSync(markdownPath, renderEmailDraftMarkdown(draft), "utf8");
  }

  if (draft.product_id) {
    updateLeadStatusInScored(root, draft.product_id, leadId, "email_drafted");
  }

  return draft;
}

export function computeZhSourceHash(subject: string, body: string): string {
  return createHash("sha256")
    .update(`${subject}\n${body}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/**
 * 仅写入中文对照字段，不改外文 subject/body/status。
 */
export function saveEmailDraftZh(
  root: string,
  leadId: string,
  slot: EmailDraftSlot,
  input: { subject_zh: string; body_zh: string }
):
  | {
      success: true;
      lead_id: string;
      recipient_key: string;
      draft_path: string;
      subject_zh: string | null;
      body_zh: string | null;
      zh_source_hash: string;
    }
  | { success: false; error: string; lead_id: string; recipient_key: string } {
  const recipient_key = recipientKeyFromSlot(slot);
  const existing = loadEmailDraftSlot(root, leadId, slot);
  if (!existing) {
    return {
      success: false,
      error: "draft_not_found",
      lead_id: leadId,
      recipient_key,
    };
  }

  const subject_zh = input.subject_zh.trim() || null;
  const body_zh = input.body_zh.trim() || null;
  if (!subject_zh && !body_zh) {
    return {
      success: false,
      error: "empty_zh",
      lead_id: leadId,
      recipient_key,
    };
  }

  const zh_source_hash = computeZhSourceHash(existing.subject, existing.body);
  const now = new Date().toISOString();
  const draft: EmailDraft = EmailDraftSchema.parse({
    ...existing,
    updated_at: now,
    subject_zh,
    body_zh,
    zh_source_hash,
  });

  const draftPath = getEmailDraftPathForSlot(root, leadId, slot);
  writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  return {
    success: true,
    lead_id: leadId,
    recipient_key,
    draft_path: relativeDraftPath(leadId, slot),
    subject_zh,
    body_zh,
    zh_source_hash,
  };
}

export function clearEmailDraftZh(
  root: string,
  leadId: string,
  slot: EmailDraftSlot
): { cleared: boolean; path: string } {
  const existing = loadEmailDraftSlot(root, leadId, slot);
  const path = relativeDraftPath(leadId, slot);
  if (!existing) return { cleared: false, path };
  if (!existing.subject_zh && !existing.body_zh && !existing.zh_source_hash) {
    return { cleared: false, path };
  }
  const draft: EmailDraft = EmailDraftSchema.parse({
    ...existing,
    updated_at: new Date().toISOString(),
    subject_zh: null,
    body_zh: null,
    zh_source_hash: null,
  });
  writeFileSync(
    getEmailDraftPathForSlot(root, leadId, slot),
    `${JSON.stringify(draft, null, 2)}\n`,
    "utf8"
  );
  return { cleared: true, path };
}

export function saveEmailDraft(
  root: string,
  leadId: string,
  input: EmailDraftInput,
  writeMarkdown = true
): EmailDraft {
  return saveEmailDraftSlot(root, leadId, { kind: "company" }, input, writeMarkdown);
}

export function listEmailDraftSlots(root: string, leadId: string): EmailDraftSlotSummary[] {
  const slots: EmailDraftSlotSummary[] = [];
  const company = loadEmailDraftSlot(root, leadId, { kind: "company" });
  if (company) {
    slots.push({
      slot: { kind: "company" },
      recipient_key: COMPANY_RECIPIENT_KEY,
      audience: company.audience,
      email: company.recipient?.email,
      name: company.recipient?.name,
      subject: company.subject,
      status: company.status,
      draft_path: relativeDraftPath(leadId, { kind: "company" }),
      created_at: company.created_at,
    });
  }

  const leadDir = join(getEmailsDir(root), leadId);
  if (!existsSync(leadDir)) return slots;

  for (const entry of readdirSync(leadDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const person = loadEmailDraftSlot(root, leadId, {
      kind: "person",
      recipientKey: entry.name,
    });
    if (!person) continue;
    slots.push({
      slot: { kind: "person", recipientKey: entry.name },
      recipient_key: entry.name,
      audience: person.audience,
      email: person.recipient?.email,
      name: person.recipient?.name,
      subject: person.subject,
      status: person.status,
      draft_path: relativeDraftPath(leadId, {
        kind: "person",
        recipientKey: entry.name,
      }),
      created_at: person.created_at,
    });
  }

  return slots;
}

function pickAggregateStatus(
  statuses: Array<EmailDraft["status"]>
): EmailDraft["status"] {
  if (statuses.some((s) => s === "pending_review")) return "pending_review";
  if (statuses.some((s) => s === "approved")) return "approved";
  if (statuses.some((s) => s === "rejected")) return "rejected";
  return "pending_review";
}

export function listEmailDraftLeadSummaries(
  root: string,
  productId?: string
): EmailDraftLeadSummary[] {
  migrateEmailDraftsIfNeeded(root);

  const baseDir = getEmailsDir(root);
  if (!existsSync(baseDir)) return [];

  const summaries: EmailDraftLeadSummary[] = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const leadId = entry.name;
    const slots = listEmailDraftSlots(root, leadId);
    if (slots.length === 0) continue;

    const companySlot = slots.find((s) => s.slot.kind === "company");
    const representative =
      companySlot ??
      [...slots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!representative) continue;

    const companyDraft = companySlot
      ? loadEmailDraftSlot(root, leadId, { kind: "company" })
      : loadEmailDraftSlot(root, leadId, representative.slot);
    if (!companyDraft) continue;
    if (productId && companyDraft.product_id !== productId) continue;

    const personCount = slots.filter((s) => s.slot.kind === "person").length;
    summaries.push({
      lead_id: leadId,
      product_id: companyDraft.product_id,
      company_name: companyDraft.recipient?.company,
      has_company_draft: Boolean(companySlot),
      person_draft_count: personCount,
      draft_count: slots.length,
      status: pickAggregateStatus(slots.map((s) => s.status)),
      newest_created_at: slots
        .map((s) => s.created_at)
        .sort((a, b) => b.localeCompare(a))[0]!,
      representative_path: representative.draft_path,
      subject: representative.subject,
      recipient_email: companyDraft.recipient?.email,
      slots,
    });
  }

  return summaries.sort((a, b) =>
    b.newest_created_at.localeCompare(a.newest_created_at)
  );
}

/** 兼容旧调用：返回各 lead 的代表稿（优先公司向） */
export function listEmailDrafts(root: string, productId?: string): EmailDraft[] {
  const summaries = listEmailDraftLeadSummaries(root, productId);
  const drafts: EmailDraft[] = [];
  for (const summary of summaries) {
    const slot = summary.has_company_draft
      ? ({ kind: "company" } as const)
      : summary.slots[0]?.slot;
    if (!slot) continue;
    const draft = loadEmailDraftSlot(root, summary.lead_id, slot);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export function deleteEmailDraftSlot(
  root: string,
  leadId: string,
  slot: EmailDraftSlot
): { removed: boolean; path: string } {
  const draftPath = getEmailDraftPathForSlot(root, leadId, slot);
  const mdPath = getEmailDraftMarkdownPathForSlot(root, leadId, slot);
  let removed = false;
  if (existsSync(draftPath)) {
    rmSync(draftPath, { force: true });
    removed = true;
  }
  if (existsSync(mdPath)) {
    rmSync(mdPath, { force: true });
    removed = true;
  }
  if (slot.kind === "person") {
    const dir = dirname(draftPath);
    if (existsSync(dir)) {
      const left = readdirSync(dir);
      if (left.length === 0) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  return { removed, path: relativeDraftPath(leadId, slot) };
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

export function planEmailDraftsForProduct(
  root: string,
  productId: string,
  options?: {
    lead_ids?: string[];
    limit?: number;
  }
): {
  plans: DraftSlotPlan[];
  skipped: Array<{ lead_id: string; reason: string }>;
  warnings: Array<{ lead_id: string; code: string; detail: string }>;
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
  const plans: DraftSlotPlan[] = [];
  const skipped: Array<{ lead_id: string; reason: string }> = [];
  const warnings: Array<{ lead_id: string; code: string; detail: string }> = [];

  for (const lead of targets) {
    if (loadEmailDraft(root, lead.id) && !options?.lead_ids) {
      skipped.push({ lead_id: lead.id, reason: "draft_already_exists" });
      continue;
    }

    const plan = planDraftSlots(lead, productId);
    plans.push(plan);
    if (plan.truncated_person_count > 0) {
      warnings.push({
        lead_id: lead.id,
        code: "person_slots_capped",
        detail: `truncated ${plan.truncated_person_count} person emails`,
      });
    }
  }

  return { plans, skipped, warnings };
}

export function planEmailDraftSlotForProduct(
  root: string,
  productId: string,
  leadId: string,
  options: {
    audience: "company" | "person";
    email?: string;
    recipient_key?: string;
  }
): ReturnType<typeof planSingleSlot> {
  const scored = loadScoredLeads(root, productId);
  if (!scored) {
    throw new Error(`No scored leads found for product: ${productId}`);
  }
  const lead = scored.leads.find((item) => item.id === leadId);
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }
  return planSingleSlot(lead, productId, options);
}

/**
 * @deprecated US-M-02：不再写模板正文。请用 planEmailDraftsForProduct + Agent save。
 * 保留函数签名仅供旧测试；生产 MCP 已改为转调 plan。
 */
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
  void options?.write_markdown;
  const planned = planEmailDraftsForProduct(root, productId, options);
  return {
    drafts: [],
    skipped: planned.skipped,
  };
}

export { flattenPlanSlots, planDraftSlots };

export function buildDraftSummary(draft: EmailDraft): {
  lead_id: string;
  company: string | undefined;
  subject: string;
  recipient: string | undefined;
  audience: EmailDraft["audience"];
} {
  return {
    lead_id: draft.lead_id,
    company: draft.recipient?.company,
    subject: draft.subject,
    recipient: draft.recipient?.email,
    audience: draft.audience,
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

export { migrateEmailDraftsIfNeeded, slotFromRecipientKey, recipientKeyFromSlot };
