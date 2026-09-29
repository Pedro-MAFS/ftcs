import { z } from "zod";

/** Google Text Search（New）各页合计上限。 */
export const TEXT_SEARCH_MAX_RESULTS = 60;

/** 调用方希望返回的条数。超过 20 时由 MCP 翻页，不把页码交给调用方。 */
export const textSearchPageSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(TEXT_SEARCH_MAX_RESULTS)
  .default(20)
  .describe(
    "How many places to return (1-60). Requests above 20 are paged inside this server.",
  );

export const PlaceSummarySchema = z.object({
  placeId: z.string(),
  displayName: z.string(),
  formattedAddress: z.string(),
  types: z.array(z.string()),
  businessStatus: z.string().optional(),
});

export const TextSearchResponseSchema = z.object({
  provider: z.literal("custom"),
  cached: z.boolean(),
  textQuery: z.string(),
  languageCode: z.string(),
  regionCode: z.string().optional(),
  pageSize: z.number(),
  places: z.array(PlaceSummarySchema),
});

export const PlaceDetailsResponseSchema = z.object({
  provider: z.literal("custom"),
  cached: z.boolean(),
  placeId: z.string(),
  displayName: z.string(),
  formattedAddress: z.string(),
  types: z.array(z.string()),
  websiteUri: z.string().optional(),
});

export type PlaceSummary = z.infer<typeof PlaceSummarySchema>;
export type TextSearchResponse = z.infer<typeof TextSearchResponseSchema>;
export type PlaceDetailsResponse = z.infer<typeof PlaceDetailsResponseSchema>;
