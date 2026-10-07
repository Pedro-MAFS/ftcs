import { z } from "zod";
import { PersonSchema } from "./person-types.js";

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

export const CompanyIntelligenceStatusSchema = z.enum(["pending", "ready", "failed"]);

export type CompanyIntelligenceStatus = z.infer<typeof CompanyIntelligenceStatusSchema>;

/** 落盘形态。六段 + 破冰一一对应；不接受整篇 Markdown。 */
export const CompanyIntelligenceSchema = z.object({
  businessModel: z.string(),
  productsBrands: z.string(),
  targetMarket: z.string(),
  supplyChain: z.string(),
  industryPosition: z.string(),
  collabOpportunity: z.string(),
  icebreak: z.string(),
  status: CompanyIntelligenceStatusSchema,
  errorMessage: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CompanyIntelligence = z.infer<typeof CompanyIntelligenceSchema>;

export const COMPANY_INTELLIGENCE_TEXT_KEYS = [
  "businessModel",
  "productsBrands",
  "targetMarket",
  "supplyChain",
  "industryPosition",
  "collabOpportunity",
  "icebreak",
] as const;

export type CompanyIntelligenceTextKey = (typeof COMPANY_INTELLIGENCE_TEXT_KEYS)[number];

export type CompanyIntelligenceTexts = Record<CompanyIntelligenceTextKey, string>;

export const COMPANY_INTELLIGENCE_MAX_CHARS = 4000;

export const COMPANY_INTELLIGENCE_INVALID_MESSAGE =
  "目标公司画像未写入：缺少字段或不是规定的文本";

const COMPANY_INTELLIGENCE_TEXT_KEY_SET = new Set<string>(COMPANY_INTELLIGENCE_TEXT_KEYS);

export function validateCompanyIntelligenceInput(
  input: unknown,
): { ok: true; texts: CompanyIntelligenceTexts } | { ok: false; message: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: COMPANY_INTELLIGENCE_INVALID_MESSAGE };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== COMPANY_INTELLIGENCE_TEXT_KEYS.length ||
    keys.some((key) => !COMPANY_INTELLIGENCE_TEXT_KEY_SET.has(key))
  ) {
    return { ok: false, message: COMPANY_INTELLIGENCE_INVALID_MESSAGE };
  }
  const texts = {} as CompanyIntelligenceTexts;
  for (const key of COMPANY_INTELLIGENCE_TEXT_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || value.length > COMPANY_INTELLIGENCE_MAX_CHARS) {
      return { ok: false, message: COMPANY_INTELLIGENCE_INVALID_MESSAGE };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > COMPANY_INTELLIGENCE_MAX_CHARS) {
      return { ok: false, message: COMPANY_INTELLIGENCE_INVALID_MESSAGE };
    }
    texts[key] = trimmed;
  }
  return { ok: true, texts };
}

export function buildReadyCompanyIntelligence(
  texts: CompanyIntelligenceTexts,
  updatedAt = new Date().toISOString(),
): CompanyIntelligence {
  return {
    businessModel: texts.businessModel,
    productsBrands: texts.productsBrands,
    targetMarket: texts.targetMarket,
    supplyChain: texts.supplyChain,
    industryPosition: texts.industryPosition,
    collabOpportunity: texts.collabOpportunity,
    icebreak: texts.icebreak,
    status: "ready",
    updatedAt,
  };
}

export function buildFailedCompanyIntelligence(
  previous: CompanyIntelligence | undefined,
  updatedAt = new Date().toISOString(),
): CompanyIntelligence {
  return {
    businessModel: previous?.businessModel ?? "",
    productsBrands: previous?.productsBrands ?? "",
    targetMarket: previous?.targetMarket ?? "",
    supplyChain: previous?.supplyChain ?? "",
    industryPosition: previous?.industryPosition ?? "",
    collabOpportunity: previous?.collabOpportunity ?? "",
    icebreak: previous?.icebreak ?? "",
    status: "failed",
    errorMessage: COMPANY_INTELLIGENCE_INVALID_MESSAGE,
    updatedAt,
  };
}

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
  /** 旧线索可没有。有则必须是六段 + 破冰，而不是整篇自由文本 */
  companyIntelligence: CompanyIntelligenceSchema.optional(),
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
  people: z.array(PersonSchema).default([]),
  round: z.enum(["R1", "R2", "R3", "R4"]).optional(),
  query_id: z.string().optional(),
  run_id: z.string().optional(),
  discovered_at: z.string().optional(),
  companyIntelligence: CompanyIntelligenceSchema.optional(),
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
