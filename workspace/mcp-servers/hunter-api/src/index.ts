#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HunterClient, HunterError } from "./client.js";
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
  "Hunter Domain Search: find published email contacts for a lead's domain (1 credit per call, result cached 24h). Requires HUNTER_API_KEYS.",
  {
    domain: z
      .string()
      .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i)
      .describe("Lead company eTLD+1 domain, e.g. pantron.com"),
    limit: z.number().int().min(1).max(100).default(10).describe("Max emails (free plan caps at 10)"),
    type: z.enum(["personal", "generic"]).optional().describe("Filter by email type"),
    department: z.string().optional().describe("Comma-separated departments, e.g. sales,marketing"),
    seniority: z.string().optional().describe("Comma-separated seniority: junior,senior,executive"),
  },
  async ({ domain, limit, type, department, seniority }) => {
    try {
      const client = createClient();
      const result = await client.domainSearch({
        domain: domain.toLowerCase(),
        limit,
        ...(type ? { type } : {}),
        ...(department ? { department } : {}),
        ...(seniority ? { seniority } : {}),
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
  "Hunter Email Verifier: check deliverability of one email (0.5 credit). Polls 202 up to ~24s. Only call when the user opted in to verification.",
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
