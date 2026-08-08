import { z } from "zod";

export const LeadCompanySchema = z.object({
  name: z.string().optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
});

export const LeadSourceSchema = z.object({
  url: z.string(),
  type: z.enum(["tavily_search", "google_search", "manual"]).default("tavily_search"),
  snippet: z.string().optional(),
});

export const LeadContactSchema = z.object({
  type: z.enum(["email", "phone", "form", "linkedin"]).default("email"),
  value: z.string(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const RawLeadSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  discovered_at: z.string(),
  round: z.enum(["R1", "R2", "R3", "R4"]),
  query_id: z.string(),
  /** 所属探索运行；历史数据可为空 */
  run_id: z.string().optional(),
  company: LeadCompanySchema,
  source: LeadSourceSchema,
  match_reason: z.string(),
  contacts: z.array(LeadContactSchema).default([]),
  raw_score: z.number().optional(),
});

export type RawLead = z.infer<typeof RawLeadSchema>;

export const RawLeadInputSchema = RawLeadSchema.omit({
  id: true,
  discovered_at: true,
}).extend({
  id: z.string().optional(),
  discovered_at: z.string().optional(),
});

export type RawLeadInput = z.infer<typeof RawLeadInputSchema>;

export const ExplorationRunSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.enum(["running", "completed", "failed"]),
  rounds: z.array(z.enum(["R1", "R2", "R3", "R4"])),
  queries_executed: z.number().int().nonnegative(),
  leads_found: z.number().int().nonnegative(),
  leads_after_dedupe: z.number().int().nonnegative().optional(),
  api_usage: z.object({
    search_calls: z.number().int().nonnegative(),
    crawl_pages: z.number().int().nonnegative(),
  }),
  errors: z.array(z.string()).default([]),
});

export type ExplorationRun = z.infer<typeof ExplorationRunSchema>;

export const ExplorationRunInputSchema = ExplorationRunSchema.partial({
  finished_at: true,
  leads_after_dedupe: true,
}).extend({
  id: z.string().optional(),
});

export type ExplorationRunInput = z.infer<typeof ExplorationRunInputSchema>;

export const ScoreBreakdownSchema = z.object({
  product_match: z.number(),
  purchase_intent: z.number(),
  size_fit: z.number(),
  geo_match: z.number(),
  reachability: z.number(),
  competition: z.number(),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const LeadStatusSchema = z.enum([
  "new",
  "reviewed",
  "email_drafted",
  "email_approved",
  "contacted",
  "replied",
  "converted",
  "rejected",
]);

export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LeadTierSchema = z.enum(["high", "medium", "low"]);

export type LeadTier = z.infer<typeof LeadTierSchema>;

export const ScoredLeadSchema = z.object({
  id: z.string(),
  company: LeadCompanySchema,
  score: z.number(),
  score_breakdown: ScoreBreakdownSchema,
  tier: LeadTierSchema,
  status: LeadStatusSchema,
  dedupe_key: z.string(),
  source_url: z.string(),
  match_reason: z.string(),
  contacts: z.array(LeadContactSchema).default([]),
  round: z.enum(["R1", "R2", "R3", "R4"]).optional(),
  query_id: z.string().optional(),
  run_id: z.string().optional(),
  discovered_at: z.string().optional(),
});

export type ScoredLead = z.infer<typeof ScoredLeadSchema>;

export const ScoredLeadsFileSchema = z.object({
  product_id: z.string(),
  updated_at: z.string(),
  leads: z.array(ScoredLeadSchema),
  stats: z.object({
    total: z.number().int().nonnegative(),
    by_tier: z.record(z.string(), z.number()),
    by_status: z.record(z.string(), z.number()),
  }),
});

export type ScoredLeadsFile = z.infer<typeof ScoredLeadsFileSchema>;

/** 评分去重时因同域名被淘汰的原始线索 */
export const DiscardedLeadSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  dedupe_key: z.string(),
  reason: z.literal("duplicate_domain"),
  kept_lead_id: z.string(),
  company: LeadCompanySchema,
  source: LeadSourceSchema,
  match_reason: z.string(),
  contacts: z.array(LeadContactSchema).default([]),
  round: z.enum(["R1", "R2", "R3", "R4"]),
  query_id: z.string(),
  run_id: z.string().optional(),
  discovered_at: z.string(),
  raw_score: z.number().optional(),
});

export type DiscardedLead = z.infer<typeof DiscardedLeadSchema>;

export const DiscardedLeadsFileSchema = z.object({
  product_id: z.string(),
  updated_at: z.string(),
  leads: z.array(DiscardedLeadSchema),
  stats: z.object({
    total: z.number().int().nonnegative(),
  }),
});

export type DiscardedLeadsFile = z.infer<typeof DiscardedLeadsFileSchema>;
