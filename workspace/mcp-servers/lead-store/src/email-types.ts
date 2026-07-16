import { z } from "zod";

export const EmailVariantSchema = z.object({
  type: z.enum(["short", "professional"]),
  subject: z.string(),
  body: z.string(),
});

export type EmailVariant = z.infer<typeof EmailVariantSchema>;

export const EmailReviewSchema = z.object({
  approved: z.boolean().nullable(),
  reviewer_notes: z.string().nullable(),
  reviewed_at: z.string().nullable(),
});

export const EmailDraftSchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  product_id: z.string(),
  created_at: z.string(),
  status: z.enum(["pending_review", "approved", "rejected"]).default("pending_review"),
  language: z.string(),
  variants: z.array(EmailVariantSchema).min(1),
  personalization_evidence: z.array(z.string()).default([]),
  selected_variant: z.enum(["short", "professional"]).nullable(),
  review: EmailReviewSchema.default({
    approved: null,
    reviewer_notes: null,
    reviewed_at: null,
  }),
  recipient: z
    .object({
      company: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export const EmailDraftInputSchema = EmailDraftSchema.omit({
  id: true,
  created_at: true,
}).extend({
  id: z.string().optional(),
  created_at: z.string().optional(),
});

export type EmailDraftInput = z.infer<typeof EmailDraftInputSchema>;
