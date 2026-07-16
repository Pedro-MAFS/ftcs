import { z } from "zod";

export const CompanySchema = z.object({
  name: z.string().optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
  certifications: z.array(z.string()).optional(),
});

export const ProductItemSchema = z.object({
  name: z.string().optional(),
  name_en: z.string().optional(),
  category: z.string().optional(),
  hs_code: z.string().optional(),
  materials: z.array(z.string()).optional(),
  specs: z.array(z.string()).optional(),
  moq: z.string().optional(),
  price_range: z.string().optional(),
  use_cases: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
});

export const BuyerPersonaSchema = z.object({
  role: z.string().optional(),
  company_types: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  pain_points: z.array(z.string()).optional(),
});

export const TargetMarketsSchema = z.object({
  regions: z.array(z.string()).optional(),
  excluded_regions: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
});

export const CompetitorSchema = z.object({
  name: z.string().optional(),
  website: z.string().optional(),
});

export const SourceInputSchema = z.object({
  type: z.enum(["website", "file", "example", "manual"]),
  url: z.string().optional(),
  path: z.string().optional(),
  note: z.string().optional(),
  crawled_at: z.string().optional(),
  uploaded_at: z.string().optional(),
  created_at: z.string().optional(),
});

export const ReadinessSchema = z.object({
  score: z.number(),
  missing_fields: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const ProductProfileSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  created_at: z.string(),
  updated_at: z.string(),
  status: z.enum(["draft", "ready", "archived"]),
  readiness: ReadinessSchema,
  company: CompanySchema.default({}),
  products: z.array(ProductItemSchema).default([]),
  buyer_personas: z.array(BuyerPersonaSchema).default([]),
  target_markets: TargetMarketsSchema.default({}),
  competitors: z.array(CompetitorSchema).default([]),
  source_inputs: z.array(SourceInputSchema).default([]),
});

export type ProductProfile = z.infer<typeof ProductProfileSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;

export const ProductProfileInputSchema = z.object({
  id: z.string().optional(),
  version: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  status: z.enum(["draft", "ready", "archived"]).optional(),
  readiness: ReadinessSchema.optional(),
  company: CompanySchema.optional(),
  products: z.array(ProductItemSchema).optional(),
  buyer_personas: z.array(BuyerPersonaSchema).optional(),
  target_markets: TargetMarketsSchema.optional(),
  competitors: z.array(CompetitorSchema).optional(),
  source_inputs: z.array(SourceInputSchema).optional(),
});

export type ProductProfileInput = z.infer<typeof ProductProfileInputSchema>;
