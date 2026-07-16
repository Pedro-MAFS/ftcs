import { z } from "zod";

export const KeywordDimensionSchema = z.enum([
  "product",
  "scenario",
  "buyer",
  "geo",
  "competitor",
]);

export type KeywordDimension = z.infer<typeof KeywordDimensionSchema>;

export const SearchQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
  dimension: KeywordDimensionSchema,
  language: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  round: z.enum(["R1", "R2", "R3", "R4"]),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const KeywordExpansionSchema = z.object({
  product_id: z.string(),
  generated_at: z.string(),
  dimensions: z.object({
    product: z.array(z.string()),
    scenario: z.array(z.string()),
    buyer: z.array(z.string()),
    geo: z.array(z.string()),
    competitor: z.array(z.string()),
  }),
  search_queries: z.array(SearchQuerySchema),
  stats: z.object({
    total_queries: z.number(),
    by_round: z.record(z.string(), z.number()),
    by_dimension: z.record(z.string(), z.number()).optional(),
  }),
});

export type KeywordExpansion = z.infer<typeof KeywordExpansionSchema>;

export const KeywordExpansionInputSchema = KeywordExpansionSchema.omit({
  generated_at: true,
  stats: true,
}).extend({
  generated_at: z.string().optional(),
  stats: KeywordExpansionSchema.shape.stats.optional(),
});

export type KeywordExpansionInput = z.infer<typeof KeywordExpansionInputSchema>;
