import { z } from "zod";

export const KeywordDimensionSchema = z.enum([
  "product",
  "scenario",
  "buyer",
  "geo",
  "competitor",
]);

export type KeywordDimension = z.infer<typeof KeywordDimensionSchema>;

/** R2/R3 query 不得含 Google 式运算符；R2 站点限定走 site_id / include_domains */
export const FORBIDDEN_CHANNEL_QUERY_OPERATOR = /\b(site|intitle|inurl|filetype)\s*:/i;

/** @deprecated 使用 FORBIDDEN_CHANNEL_QUERY_OPERATOR */
export const FORBIDDEN_R2_QUERY_OPERATOR = FORBIDDEN_CHANNEL_QUERY_OPERATOR;

export const SearchQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
  dimension: KeywordDimensionSchema,
  language: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  round: z.enum(["R1", "R2", "R3", "R4"]),
  /** 仅 R2；读旧文件时可缺省。必须出现在 MCP JSON Schema 里，否则工具调用会被丢掉该字段。 */
  site_id: z
    .string()
    .min(1)
    .optional()
    .describe("R2 必填。值为 config/explore-r2-sites.yaml 中的站点 id，如 linkedin_company"),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

const forbiddenOperatorMessage = (round: string) =>
  `${round} 搜索词不能包含 site: / intitle: / inurl: / filetype:`;

export const SearchQueryWriteSchema = SearchQuerySchema.superRefine((query, ctx) => {
  if (query.round === "R2") {
    if (!query.site_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "R2 搜索词必须填写 site_id",
        path: ["site_id"],
      });
    }
    if (FORBIDDEN_CHANNEL_QUERY_OPERATOR.test(query.query)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: forbiddenOperatorMessage("R2"),
        path: ["query"],
      });
    }
    return;
  }
  if (query.site_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "只有 R2 搜索词可以带 site_id",
      path: ["site_id"],
    });
  }
  if (query.round === "R3" && FORBIDDEN_CHANNEL_QUERY_OPERATOR.test(query.query)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: forbiddenOperatorMessage("R3"),
      path: ["query"],
    });
  }
});

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

export const KeywordExpansionWriteSchema = KeywordExpansionSchema.extend({
  search_queries: z.array(SearchQueryWriteSchema),
});

/** MCP keywords_save 入参：用普通 object schema，保证 site_id 出现在工具 JSON Schema 中。写校验走 SearchQueryWriteSchema。 */
export const KeywordExpansionInputSchema = KeywordExpansionSchema.omit({
  generated_at: true,
  stats: true,
}).extend({
  generated_at: z.string().optional(),
  stats: KeywordExpansionSchema.shape.stats.optional(),
  search_queries: z.array(SearchQuerySchema),
});

export type KeywordExpansionInput = z.infer<typeof KeywordExpansionInputSchema>;
