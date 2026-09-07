#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readDetailsCache, readSearchCache, writeDetailsCache, writeSearchCache } from "./cache.js";
import {
  PlacesHttpError,
  PlacesResponseInvalidError,
  placeDetailsCustom,
  textSearchCustom,
} from "./custom.js";
import { findProjectRoot } from "./paths.js";
import {
  getGooglePlacesApiKey,
  getPlacesProvider,
  isGatewayProvider,
} from "./provider.js";
import { initPlacesFetch } from "./fetch.js";
import {
  PlaceDetailsResponseSchema,
  TextSearchResponseSchema,
} from "./types.js";

const server = new McpServer({
  name: "places-api",
  version: "0.1.0",
});

function errorPayload(code: string, message: string, httpStatus?: number) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: true,
          code,
          message,
          ...(httpStatus !== undefined ? { http_status: httpStatus } : {}),
        }),
      },
    ],
  };
}

function providerGate():
  | { ok: true; provider: "custom"; apiKey: string }
  | { ok: false; response: ReturnType<typeof errorPayload> } {
  const provider = getPlacesProvider();
  if (isGatewayProvider(provider)) {
    return {
      ok: false,
      response: errorPayload(
        "PLACES_GATEWAY_NOT_READY",
        "Places 官方网关通道尚未就绪（US-E-10）。请使用 PLACES_PROVIDER=custom 并配置 GOOGLE_PLACES_API_KEY。",
      ),
    };
  }
  if (provider !== "custom") {
    return {
      ok: false,
      response: errorPayload(
        "PLACES_INVALID_ARGUMENT",
        `Unsupported PLACES_PROVIDER: ${provider}. Supported: custom`,
      ),
    };
  }

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return {
      ok: false,
      response: errorPayload(
        "MISSING_PLACES_API_KEY",
        "未配置 GOOGLE_PLACES_API_KEY。请在设置 → 探索中填写 Google Places API Key（仅 R3 需要）。",
      ),
    };
  }

  return { ok: true, provider: "custom", apiKey };
}

server.tool(
  "places_text_search",
  "Google Places Text Search (Pro FieldMask). Returns local merchants for R3 map discovery. Requires GOOGLE_PLACES_API_KEY.",
  {
    textQuery: z.string().describe("Natural language query: city/region + category (R3 keyword)"),
    languageCode: z.string().default("en").describe("BCP-47 language, e.g. en, de"),
    regionCode: z
      .string()
      .optional()
      .describe("ISO 3166-1 alpha-2 region bias, e.g. DE, US"),
    pageSize: z.number().int().min(1).max(20).default(20).describe("Max results (1-20, no pagination)"),
  },
  async ({ textQuery, languageCode, regionCode, pageSize }) => {
    const trimmedQuery = textQuery.trim();
    if (!trimmedQuery) {
      return errorPayload("PLACES_INVALID_ARGUMENT", "textQuery 不能为空");
    }

    const gate = providerGate();
    if (!gate.ok) {
      return gate.response;
    }

    const root = findProjectRoot();
    const region = regionCode?.trim().toUpperCase() || "";

    try {
      const cached = readSearchCache(root, trimmedQuery, languageCode, region, pageSize);
      if (cached) {
        const payload = TextSearchResponseSchema.parse({
          provider: "custom",
          cached: true,
          textQuery: trimmedQuery,
          languageCode,
          ...(region ? { regionCode: region } : {}),
          pageSize,
          places: cached.places,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }

      const places = await textSearchCustom(
        gate.apiKey,
        trimmedQuery,
        languageCode,
        region || undefined,
        pageSize,
      );
      writeSearchCache(root, trimmedQuery, languageCode, region, pageSize, "custom", places);

      const payload = TextSearchResponseSchema.parse({
        provider: "custom",
        cached: false,
        textQuery: trimmedQuery,
        languageCode,
        ...(region ? { regionCode: region } : {}),
        pageSize,
        places,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      if (error instanceof PlacesHttpError) {
        return errorPayload("PLACES_HTTP_ERROR", error.message, error.httpStatus);
      }
      if (error instanceof PlacesResponseInvalidError) {
        return errorPayload("PLACES_RESPONSE_INVALID", error.message);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorPayload("PLACES_HTTP_ERROR", message);
    }
  },
);

server.tool(
  "place_details",
  "Google Place Details (Enterprise FieldMask) for a single placeId — includes websiteUri when available.",
  {
    placeId: z.string().describe("Place ID from places_text_search"),
    languageCode: z.string().default("en").describe("BCP-47 language, e.g. en, de"),
  },
  async ({ placeId, languageCode }) => {
    const trimmedId = placeId.trim();
    if (!trimmedId) {
      return errorPayload("PLACES_INVALID_ARGUMENT", "placeId 不能为空");
    }

    const gate = providerGate();
    if (!gate.ok) {
      return gate.response;
    }

    const root = findProjectRoot();

    try {
      const cached = readDetailsCache(root, trimmedId, languageCode);
      if (cached) {
        const payload = PlaceDetailsResponseSchema.parse({
          provider: "custom",
          cached: true,
          placeId: cached.placeId,
          displayName: cached.displayName,
          formattedAddress: cached.formattedAddress,
          types: cached.types,
          websiteUri: cached.websiteUri,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }

      const details = await placeDetailsCustom(gate.apiKey, trimmedId, languageCode);
      writeDetailsCache(root, details.placeId, languageCode, "custom", {
        displayName: details.displayName,
        formattedAddress: details.formattedAddress,
        types: details.types,
        websiteUri: details.websiteUri,
      });

      const payload = PlaceDetailsResponseSchema.parse({
        ...details,
        cached: false,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      if (error instanceof PlacesHttpError) {
        return errorPayload("PLACES_HTTP_ERROR", error.message, error.httpStatus);
      }
      if (error instanceof PlacesResponseInvalidError) {
        return errorPayload("PLACES_RESPONSE_INVALID", error.message);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorPayload("PLACES_HTTP_ERROR", message);
    }
  },
);

async function main(): Promise<void> {
  await initPlacesFetch();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
