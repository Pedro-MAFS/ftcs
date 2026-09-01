import { z } from "zod";

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
