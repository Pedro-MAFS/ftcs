import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EmailAudience, EmailDraft } from "./email-types.js";
import { EmailDraftSchema } from "./email-types.js";
import { getEmailsDir } from "./paths.js";
import { renderEmailDraftMarkdown } from "./email-drafter.js";

export type PathHint = "company" | "person";

/** 迁移前旁路备份后缀；与 draft.json 同目录，list 不扫描 */
export const EMAIL_DRAFT_PRE_MIGRATE_SUFFIX = ".pre-m01";

export type MigrateFileResult =
  | { status: "skipped" }
  | { status: "migrated"; backedUp: boolean }
  | { status: "failed"; error: string };

export type MigrateAllResult = {
  migrated: number;
  skipped: number;
  backedUp: number;
  failed: Array<{ path: string; error: string }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function needsMigration(raw: unknown): boolean {
  const obj = asRecord(raw);
  if (!obj) return false;

  const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0;
  const hasAudience = obj.audience === "company" || obj.audience === "person";
  const subject = asString(obj.subject).trim();
  const body = asString(obj.body);
  const hasBodyPair = subject.length > 0 && body.length > 0;

  if (hasVariants) return true;
  if ("selected_variant" in obj) return true;
  if (!hasAudience) return true;
  if (!hasBodyPair) return true;
  return false;
}

export function pickBodyFromLegacy(raw: Record<string, unknown>): {
  subject: string;
  body: string;
} | null {
  const topSubject = asString(raw.subject).trim();
  const topBody = asString(raw.body);
  if (topSubject.length > 0 && topBody.length > 0) {
    return { subject: topSubject, body: topBody };
  }

  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  let chosen: Record<string, unknown> | null = null;
  for (const item of variants) {
    const v = asRecord(item);
    if (v && asString(v.type) === "professional") {
      chosen = v;
      break;
    }
  }
  if (!chosen && variants.length > 0) {
    chosen = asRecord(variants[0]);
  }
  if (!chosen) return null;

  const subject = asString(chosen.subject).trim();
  const body = asString(chosen.body);
  if (!subject && !body) return null;
  return { subject, body };
}

function normalizeRecipient(raw: unknown): EmailDraft["recipient"] | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const email = asString(rec.email).trim().toLowerCase();
  const aliasesRaw = Array.isArray(rec.recipient_aliases) ? rec.recipient_aliases : [];
  const aliases = aliasesRaw
    .map((item) => asString(item).trim().toLowerCase())
    .filter(Boolean);
  const nameVal = rec.name;
  const name =
    nameVal === null ? null : typeof nameVal === "string" ? nameVal : undefined;

  return {
    company: asString(rec.company) || undefined,
    email: email || undefined,
    name: name === undefined ? undefined : name,
    recipient_aliases: aliases.length > 0 ? aliases : undefined,
  };
}

export function buildMigratedDraft(
  raw: Record<string, unknown>,
  pathHint: PathHint,
  now = new Date().toISOString()
): EmailDraft {
  const picked = pickBodyFromLegacy(raw);
  if (!picked) {
    throw new Error("cannot pick subject/body from legacy draft");
  }

  let audience: EmailAudience =
    raw.audience === "person" || raw.audience === "company"
      ? raw.audience
      : pathHint === "person"
        ? "person"
        : "company";
  if (pathHint === "company") {
    audience = "company";
  }

  const leadId = asString(raw.lead_id);
  const statusRaw = asString(raw.status);
  const status =
    statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "pending_review"
      ? statusRaw
      : "pending_review";

  const reviewRec = asRecord(raw.review) ?? {};
  const evidence = Array.isArray(raw.personalization_evidence)
    ? raw.personalization_evidence.map(String)
    : [];

  return EmailDraftSchema.parse({
    id: asString(raw.id) || leadId || `email_${Date.now()}`,
    lead_id: leadId,
    product_id: asString(raw.product_id),
    created_at: asString(raw.created_at) || now,
    updated_at: now,
    status,
    language: asString(raw.language) || "en",
    audience,
    recipient: normalizeRecipient(raw.recipient),
    subject: picked.subject,
    body: picked.body,
    subject_zh:
      raw.subject_zh === null || typeof raw.subject_zh === "string" ? raw.subject_zh : null,
    body_zh: raw.body_zh === null || typeof raw.body_zh === "string" ? raw.body_zh : null,
    style_prompt:
      raw.style_prompt === null || typeof raw.style_prompt === "string"
        ? raw.style_prompt
        : null,
    personalization_evidence: evidence,
    review: {
      approved: typeof reviewRec.approved === "boolean" ? reviewRec.approved : null,
      reviewer_notes:
        reviewRec.reviewer_notes === null || typeof reviewRec.reviewer_notes === "string"
          ? (reviewRec.reviewer_notes as string | null)
          : null,
      reviewed_at:
        reviewRec.reviewed_at === null || typeof reviewRec.reviewed_at === "string"
          ? (reviewRec.reviewed_at as string | null)
          : null,
    },
  });
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmpPath, filePath);
}

/** 迁移前备份：draft.json → draft.json.pre-m01；已存在则不覆盖 */
export function backupDraftBeforeMigrate(filePath: string): boolean {
  const backupPath = `${filePath}${EMAIL_DRAFT_PRE_MIGRATE_SUFFIX}`;
  if (existsSync(backupPath)) {
    return false;
  }
  copyFileSync(filePath, backupPath);

  const mdPath = join(dirname(filePath), "draft.md");
  const mdBackup = `${mdPath}${EMAIL_DRAFT_PRE_MIGRATE_SUFFIX}`;
  if (existsSync(mdPath) && !existsSync(mdBackup)) {
    copyFileSync(mdPath, mdBackup);
  }
  return true;
}

export function migrateEmailDraftFile(
  filePath: string,
  pathHint: PathHint,
  options?: { rewriteMarkdown?: boolean }
): MigrateFileResult {
  if (!existsSync(filePath)) {
    return { status: "failed", error: "file not found" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!needsMigration(raw)) {
    return { status: "skipped" };
  }

  const obj = asRecord(raw);
  if (!obj) {
    return { status: "failed", error: "invalid json object" };
  }

  try {
    const backedUp = backupDraftBeforeMigrate(filePath);
    const next = buildMigratedDraft(obj, pathHint);
    atomicWriteJson(filePath, next);

    const mdPath = join(dirname(filePath), "draft.md");
    if (options?.rewriteMarkdown || existsSync(mdPath)) {
      writeFileSync(mdPath, renderEmailDraftMarkdown(next), "utf8");
    }

    return { status: "migrated", backedUp };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function listEmailDraftJsonPaths(root: string): Array<{
  path: string;
  pathHint: PathHint;
  leadId: string;
}> {
  const baseDir = getEmailsDir(root);
  if (!existsSync(baseDir)) return [];

  const out: Array<{ path: string; pathHint: PathHint; leadId: string }> = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const leadId = entry.name;
    const leadDir = join(baseDir, leadId);
    const companyPath = join(leadDir, "draft.json");
    if (existsSync(companyPath)) {
      out.push({ path: companyPath, pathHint: "company", leadId });
    }
    for (const child of readdirSync(leadDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const personPath = join(leadDir, child.name, "draft.json");
      if (existsSync(personPath)) {
        out.push({ path: personPath, pathHint: "person", leadId });
      }
    }
  }
  return out;
}

export function migrateEmailDraftsIfNeeded(root: string): MigrateAllResult {
  const result: MigrateAllResult = { migrated: 0, skipped: 0, backedUp: 0, failed: [] };
  for (const item of listEmailDraftJsonPaths(root)) {
    const mdPath = join(dirname(item.path), "draft.md");
    const one = migrateEmailDraftFile(item.path, item.pathHint, {
      rewriteMarkdown: existsSync(mdPath),
    });
    if (one.status === "migrated") {
      result.migrated += 1;
      if (one.backedUp) result.backedUp += 1;
    } else if (one.status === "skipped") {
      result.skipped += 1;
    } else {
      result.failed.push({ path: item.path, error: one.error });
    }
  }
  return result;
}
