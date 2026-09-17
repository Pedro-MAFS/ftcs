import { z } from "zod";

export const EmailAudienceSchema = z.enum(["company", "person"]);
export type EmailAudience = z.infer<typeof EmailAudienceSchema>;

export const EmailReviewSchema = z.object({
  approved: z.boolean().nullable(),
  reviewer_notes: z.string().nullable(),
  reviewed_at: z.string().nullable(),
});

export const EmailRecipientSchema = z.object({
  company: z.string().optional(),
  email: z.string().optional(),
  name: z.string().nullable().optional(),
  recipient_aliases: z.array(z.string()).optional(),
});

/** 磁盘目标 / 新写严格 Schema（无 variants） */
export const EmailDraftSchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  product_id: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  status: z.enum(["pending_review", "approved", "rejected"]).default("pending_review"),
  language: z.string(),
  audience: EmailAudienceSchema,
  recipient: EmailRecipientSchema.optional(),
  subject: z.string(),
  body: z.string(),
  subject_zh: z.string().nullable().optional(),
  body_zh: z.string().nullable().optional(),
  zh_source_hash: z.string().nullable().optional(),
  style_prompt: z.string().nullable().optional(),
  personalization_evidence: z.array(z.string()).default([]),
  review: EmailReviewSchema.default({
    approved: null,
    reviewer_notes: null,
    reviewed_at: null,
  }),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export const EmailDraftInputSchema = EmailDraftSchema.omit({
  id: true,
  created_at: true,
}).extend({
  id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type EmailDraftInput = z.infer<typeof EmailDraftInputSchema>;

/** @deprecated 仅迁移输入识别；新代码勿写入 */
export const EmailVariantLegacySchema = z.object({
  type: z.enum(["short", "professional"]).or(z.string()),
  subject: z.string(),
  body: z.string(),
});

export type EmailDraftSlot =
  | { kind: "company" }
  | { kind: "person"; recipientKey: string };

export const COMPANY_RECIPIENT_KEY = "company" as const;

export function slotFromRecipientKey(recipientKey?: string | null): EmailDraftSlot {
  if (!recipientKey || recipientKey === COMPANY_RECIPIENT_KEY) {
    return { kind: "company" };
  }
  return { kind: "person", recipientKey };
}

export function recipientKeyFromSlot(slot: EmailDraftSlot): string {
  return slot.kind === "company" ? COMPANY_RECIPIENT_KEY : slot.recipientKey;
}
