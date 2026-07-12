#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  classifyInputFile,
  SPECIAL_FILE_MESSAGE,
  SUPPORTED_TEXT_EXTENSIONS,
} from "./file-types.js";
import { ProductProfileInputSchema } from "./profile-types.js";
import { computeReadiness, resolveStatus } from "./readiness.js";
import { generateProductId } from "./product-id.js";
import {
  ensureInputsDir,
  expandAndSaveKeywords,
  getProjectRoot,
  listProfiles,
  loadKeywords,
  loadProfile,
  saveKeywords,
  saveProfile,
} from "./storage.js";
import { KeywordExpansionInputSchema } from "./keyword-types.js";
import { RawLeadInputSchema } from "./lead-types.js";
import {
  appendRawLead,
  countUniqueLeadDomains,
  createExplorationRun,
  listExplorationRuns,
  listRawLeads,
  loadExplorationRun,
  updateExplorationRun,
} from "./lead-storage.js";
import { generateLeadId } from "./lead-id.js";

const server = new McpServer({
  name: "lead-store",
  version: "0.1.0",
});

server.tool(
  "product_save",
  "Save or update a product profile. Auto-computes readiness score and status.",
  {
    product_id: z.string().optional().describe("Existing product ID. Omit to create new."),
    profile: ProductProfileInputSchema.describe("Product profile fields to save"),
  },
  async ({ product_id, profile }) => {
    const root = getProjectRoot();
    const result = saveProfile(root, profile, product_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              created: result.created,
              product_id: result.profile.id,
              status: result.profile.status,
              readiness: result.profile.readiness,
              follow_up_questions: result.follow_up_questions,
              profile_path: `data/products/${result.profile.id}/profile.json`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "product_get",
  "Load a product profile by ID.",
  {
    product_id: z.string().describe("Product ID, e.g. prod_20260712_001"),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const profile = loadProfile(root, product_id);
    if (!profile) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: true, code: "NOT_FOUND", message: `Product not found: ${product_id}` }),
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
    };
  }
);

server.tool(
  "product_list",
  "List all saved product profiles (excluding _example).",
  {},
  async () => {
    const root = getProjectRoot();
    const profiles = listProfiles(root);
    const summary = profiles.map((profile) => ({
      id: profile.id,
      status: profile.status,
      company_name: profile.company.name ?? null,
      readiness_score: profile.readiness.score,
      updated_at: profile.updated_at,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ products: summary }, null, 2) }],
    };
  }
);

server.tool(
  "product_generate_id",
  "Generate the next product ID for today.",
  {},
  async () => {
    const root = getProjectRoot();
    const product_id = generateProductId(root);
    return {
      content: [{ type: "text", text: JSON.stringify({ product_id }, null, 2) }],
    };
  }
);

server.tool(
  "profile_compute_readiness",
  "Compute readiness score and follow-up questions from profile fields without saving.",
  {
    profile: ProductProfileInputSchema,
  },
  async ({ profile }) => {
    const root = getProjectRoot();
    const readiness = computeReadiness({
      company: profile.company ?? {},
      products: profile.products ?? [],
      buyer_personas: profile.buyer_personas ?? [],
      target_markets: profile.target_markets ?? {},
      competitors: profile.competitors ?? [],
    });
    const status = resolveStatus(readiness);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ readiness, status }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "file_classify",
  "Classify an input file as supported text, special (needs parser), or unknown.",
  {
    file_path: z.string().describe("Path to the input file"),
  },
  async ({ file_path }) => {
    const status = classifyInputFile(file_path);
    const payload = {
      file_path,
      status,
      supported_extensions: [...SUPPORTED_TEXT_EXTENSIONS].sort(),
      message:
        status === "special"
          ? SPECIAL_FILE_MESSAGE
          : status === "unknown"
            ? "未知文件类型。请优先提供 txt/md/json/csv，或提供公司网站 URL。"
            : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
);

server.tool(
  "inputs_ensure_dir",
  "Ensure data/products/{product_id}/inputs/ exists for file archiving.",
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const inputs_dir = ensureInputsDir(root, product_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ product_id, inputs_dir }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "keywords_expand",
  "Generate keyword expansion and search queries from a ready product profile, then save to data/keywords/{product_id}/expansion.json.",
  {
    product_id: z.string().describe("Ready product ID"),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    try {
      const result = expandAndSaveKeywords(root, product_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                created: result.created,
                product_id,
                expansion_path: `data/keywords/${product_id}/expansion.json`,
                stats: result.expansion.stats,
                dimensions_covered: Object.entries(result.expansion.stats.by_dimension ?? {})
                  .filter(([, count]) => count > 0)
                  .map(([dimension]) => dimension),
                sample_queries: result.expansion.search_queries.slice(0, 5),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: true, code: "EXPANSION_FAILED", message }),
          },
        ],
      };
    }
  }
);

server.tool(
  "keywords_get",
  "Load keyword expansion for a product.",
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const expansion = loadKeywords(root, product_id);
    if (!expansion) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Keyword expansion not found: ${product_id}`,
            }),
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(expansion, null, 2) }],
    };
  }
);

server.tool(
  "keywords_save",
  "Save or overwrite keyword expansion manually (e.g. after agent refinement).",
  {
    product_id: z.string(),
    expansion: KeywordExpansionInputSchema.omit({ product_id: true }),
  },
  async ({ product_id, expansion }) => {
    const root = getProjectRoot();
    const profile = loadProfile(root, product_id);
    if (!profile) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Product not found: ${product_id}`,
            }),
          },
        ],
      };
    }

    const saved = saveKeywords(root, product_id, {
      ...expansion,
      product_id,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              product_id,
              expansion_path: `data/keywords/${product_id}/expansion.json`,
              stats: saved.stats,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "lead_generate_id",
  "Generate the next lead ID for today.",
  {},
  async () => {
    const root = getProjectRoot();
    const lead_id = generateLeadId(root);
    return {
      content: [{ type: "text", text: JSON.stringify({ lead_id }, null, 2) }],
    };
  }
);

server.tool(
  "lead_append_raw",
  "Append a raw lead to data/leads/{product_id}/raw/{round}.jsonl",
  {
    product_id: z.string(),
    round: z.enum(["R1", "R2", "R3", "R4"]),
    lead: RawLeadInputSchema.omit({ product_id: true, round: true }),
  },
  async ({ product_id, round, lead }) => {
    const root = getProjectRoot();
    const profile = loadProfile(root, product_id);
    if (!profile) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Product not found: ${product_id}`,
            }),
          },
        ],
      };
    }

    const saved = appendRawLead(root, product_id, round, {
      ...lead,
      product_id,
      round,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              lead_id: saved.id,
              raw_path: `data/leads/${product_id}/raw/${round}.jsonl`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "lead_list_raw",
  "List raw leads for a product, optionally filtered by round.",
  {
    product_id: z.string(),
    round: z.enum(["R1", "R2", "R3", "R4"]).optional(),
  },
  async ({ product_id, round }) => {
    const root = getProjectRoot();
    const leads = listRawLeads(root, product_id, round);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              product_id,
              total: leads.length,
              unique_domains: countUniqueLeadDomains(leads),
              leads,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "exploration_start",
  "Create a new exploration run record with status running.",
  {
    product_id: z.string(),
    rounds: z.array(z.enum(["R1", "R2", "R3", "R4"])).default(["R1"]),
  },
  async ({ product_id, rounds }) => {
    const root = getProjectRoot();
    const profile = loadProfile(root, product_id);
    if (!profile) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Product not found: ${product_id}`,
            }),
          },
        ],
      };
    }

    const run = createExplorationRun(root, product_id, rounds);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              run_id: run.id,
              run_path: `data/exploration/${product_id}/runs/${run.id}.json`,
              run,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "exploration_update",
  "Update exploration run counters during execution.",
  {
    product_id: z.string(),
    run_id: z.string(),
    queries_executed: z.number().int().nonnegative().optional(),
    leads_found: z.number().int().nonnegative().optional(),
    search_calls: z.number().int().nonnegative().optional(),
    crawl_pages: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  },
  async ({ product_id, run_id, queries_executed, leads_found, search_calls, crawl_pages, error }) => {
    const root = getProjectRoot();
    const existing = loadExplorationRun(root, product_id, run_id);
    if (!existing) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Exploration run not found: ${run_id}`,
            }),
          },
        ],
      };
    }

    const errors = error ? [...existing.errors, error] : existing.errors;
    const run = updateExplorationRun(root, product_id, run_id, {
      queries_executed: queries_executed ?? existing.queries_executed,
      leads_found: leads_found ?? existing.leads_found,
      api_usage: {
        search_calls: search_calls ?? existing.api_usage.search_calls,
        crawl_pages: crawl_pages ?? existing.api_usage.crawl_pages,
      },
      errors,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, run }, null, 2) }],
    };
  }
);

server.tool(
  "exploration_finish",
  "Mark an exploration run as completed or failed.",
  {
    product_id: z.string(),
    run_id: z.string(),
    status: z.enum(["completed", "failed"]).default("completed"),
  },
  async ({ product_id, run_id, status }) => {
    const root = getProjectRoot();
    const existing = loadExplorationRun(root, product_id, run_id);
    if (!existing) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Exploration run not found: ${run_id}`,
            }),
          },
        ],
      };
    }

    const leads = listRawLeads(root, product_id);
    const run = updateExplorationRun(root, product_id, run_id, {
      status,
      finished_at: new Date().toISOString(),
      leads_found: leads.length,
      leads_after_dedupe: countUniqueLeadDomains(leads),
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              run,
              run_path: `data/exploration/${product_id}/runs/${run.id}.json`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "exploration_get",
  "Load an exploration run by ID.",
  {
    product_id: z.string(),
    run_id: z.string(),
  },
  async ({ product_id, run_id }) => {
    const root = getProjectRoot();
    const run = loadExplorationRun(root, product_id, run_id);
    if (!run) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Exploration run not found: ${run_id}`,
            }),
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(run, null, 2) }],
    };
  }
);

server.tool(
  "exploration_list",
  "List exploration runs for a product.",
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const runs = listExplorationRuns(root, product_id);
    return {
      content: [{ type: "text", text: JSON.stringify({ product_id, runs }, null, 2) }],
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
