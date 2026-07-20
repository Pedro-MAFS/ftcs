#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readCache, writeCache } from "./cache.js";
import { findProjectRoot } from "./paths.js";
import {
  getSearchProvider,
  getTavilyApiKey,
  mapTavilyResults,
  SearchResponseSchema,
  searchTavily,
} from "./tavily.js";
import { getDailyUsage, incrementSearchUsage } from "./usage.js";

const server = new McpServer({
  name: "search-api",
  version: "0.2.1",
});

server.tool(
  "search_web",
  "Search the web via Tavily and return structured results (title, url, snippet). Uses cache and daily quota.",
  {
    query: z.string().describe("Search query string"),
    language: z.string().default("en").describe("Language hint for cache key, e.g. en, de"),
    num_results: z.number().int().min(1).max(10).default(5).describe("Max results to return"),
  },
  async ({ query, language, num_results }) => {
    const root = findProjectRoot();
    const provider = getSearchProvider();

    if (provider !== "tavily") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "UNSUPPORTED_PROVIDER",
              message: `Phase 1 only supports tavily. Current: ${provider}`,
            }),
          },
        ],
      };
    }

    try {
      const cached = readCache(root, query, language, num_results);
      const usage = getDailyUsage(root);

      if (cached) {
        const payload = SearchResponseSchema.parse({
          query,
          language,
          provider: cached.provider,
          cached: true,
          results: cached.results.slice(0, num_results),
          usage: {
            search_calls: usage.search_calls,
            daily_limit: usage.limit,
          },
        });

        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      }

      incrementSearchUsage(root);
      const apiKey = getTavilyApiKey();
      const tavily = await searchTavily(query, num_results, apiKey);
      const results = mapTavilyResults(tavily.results).slice(0, num_results);
      writeCache(root, query, language, num_results, provider, results);

      const updatedUsage = getDailyUsage(root);
      const payload = SearchResponseSchema.parse({
        query,
        language,
        provider,
        cached: false,
        results,
        usage: {
          search_calls: updatedUsage.search_calls,
          daily_limit: updatedUsage.limit,
        },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes("daily limit") ? "DAILY_LIMIT_EXCEEDED" : "SEARCH_FAILED";
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: true, code, message }),
          },
        ],
      };
    }
  }
);

server.tool(
  "search_usage",
  "Get today's search API usage and daily limit.",
  {},
  async () => {
    const root = findProjectRoot();
    const usage = getDailyUsage(root);
    return {
      content: [{ type: "text", text: JSON.stringify(usage, null, 2) }],
    };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
