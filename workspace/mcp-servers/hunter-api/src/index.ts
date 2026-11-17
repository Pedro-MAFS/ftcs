#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HunterClient, HunterError } from "./client.js";
import { domainSearchToolShape } from "./domain-search-params.js";
import { findProjectRoot } from "./paths.js";
import { getHunterApiKeys } from "./provider.js";

const server = new McpServer({
  name: "hunter-api",
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

function toErrorPayload(error: unknown) {
  if (error instanceof HunterError) {
    return errorPayload(error.code, error.message, error.httpStatus);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorPayload("HUNTER_UPSTREAM_ERROR", message);
}

function createClient(): HunterClient {
  return new HunterClient({ keys: getHunterApiKeys(), root: findProjectRoot() });
}

server.tool(
  "domain_search",
  "Hunter Domain Search: one call returns one page for a lead domain (cached 24h). Choose limit (1-100), type (personal or generic), department, seniority, and offset per call; omit any you are not setting. Do not assume a default limit or type. To read another page, call again with a new offset. This tool does not follow meta.results. Official channel uses the token gateway; custom channel uses HUNTER_API_KEYS.",
  domainSearchToolShape,
  async ({ domain, limit, type, department, seniority, offset }) => {
    try {
      const client = createClient();
      const result = await client.domainSearch({
        domain: domain.toLowerCase(),
        ...(limit !== undefined ? { limit } : {}),
        ...(type ? { type } : {}),
        ...(department ? { department } : {}),
        ...(seniority ? { seniority } : {}),
        ...(offset !== undefined ? { offset } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return toErrorPayload(error);
    }
  }
);

server.tool(
  "email_verifier",
  "Hunter Email Verifier. Call only when the verify toggle allows it and this address was selected. The tool does not loop people[]. Do not retry the same address after a failure. Official channel is a single gateway request: pending is false, and unknown is finished. Custom channel may poll HTTP 202 for about 24s.",
  {
    email: z.string().email().describe("Email address to verify"),
  },
  async ({ email }) => {
    try {
      const client = createClient();
      const result = await client.verifyEmail(email);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return toErrorPayload(error);
    }
  }
);

server.tool(
  "account_info",
  "Hunter account quota (free, no credits). Multi-key: reports per-key remaining and pool status.",
  {},
  async () => {
    try {
      const client = createClient();
      const result = await client.accountInfo();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return toErrorPayload(error);
    }
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
