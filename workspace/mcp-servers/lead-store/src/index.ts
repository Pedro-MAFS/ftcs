#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  classifyInputFile,
  IMAGE_FILE_MESSAGE,
  PDF_FILE_MESSAGE,
  SPECIAL_FILE_MESSAGE,
  SUPPORTED_TEXT_EXTENSIONS,
} from "./file-types.js";
import { ProductProfileInputSchema } from "./profile-types.js";
import { computeReadiness, resolveStatus } from "./readiness.js";
import { generateProductId } from "./product-id.js";
import {
  ensureInputsDir,
  getProjectRoot,
  listProfiles,
  loadKeywords,
  loadProfile,
  saveKeywords,
  saveProfile,
} from "./storage.js";
import { KeywordExpansionInputSchema } from "./keyword-types.js";
import { RawLeadInputSchema } from "./lead-types.js";
import { PersonInputSchema } from "./person-types.js";
import {
  appendRawLeadFromTool,
  countUniqueLeadDomains,
  createExplorationRun,
  listExplorationRuns,
  listRawLeads,
  loadExplorationRun,
  loadScoredLeads,
  patchScoredLead,
  scoreAndDedupeLeads,
  setLeadCompanyIntelligence,
  updateExplorationRun,
} from "./lead-storage.js";
import { generateLeadId } from "./lead-id.js";
import {
  planEmailDraftsForProduct,
  flattenPlanSlots,
  listEmailDraftLeadSummaries,
  loadEmailDraftSlot,
  planEmailDraftSlotForProduct,
  saveEmailDraftSlot,
  saveEmailDraftZh,
  slotFromRecipientKey,
  recipientKeyFromSlot,
} from "./email-storage.js";

const server = new McpServer({
  name: "lead-store",
  version: "0.5.7",
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
  "Classify an input file as supported text, image (multimodal Read), pdf sidecar, special (needs parser), or unknown.",
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
          : status === "image"
            ? IMAGE_FILE_MESSAGE
            : status === "pdf"
              ? PDF_FILE_MESSAGE
              : status === "unknown"
                ? "未知文件类型。请优先提供 txt/md/json/csv、图片、文字型 PDF，或提供公司网站 URL。"
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
  "Save keyword expansion generated by the agent (LLM). Requires a ready product profile. Validates schema and writes data/keywords/{product_id}/expansion.json.",
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

    if (profile.status !== "ready") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "PROFILE_NOT_READY",
              message: `Product profile status is "${profile.status}". Complete profile to "ready" before saving keywords.`,
            }),
          },
        ],
      };
    }

    if (profile.products.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NO_PRODUCTS",
              message: "Product profile has no products. Add at least one product before saving keywords.",
            }),
          },
        ],
      };
    }

    try {
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
                dimensions_covered: Object.entries(saved.stats.by_dimension ?? {})
                  .filter(([, count]) => count > 0)
                  .map(([dimension]) => dimension),
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
            text: JSON.stringify({ error: true, code: "SAVE_FAILED", message }),
          },
        ],
      };
    }
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
  "Append one raw lead with company base fields and companyIntelligence (six portrait strings plus icebreak) in the same call. Validation failure does not write the row. Include run_id from exploration_start. Do not pass status, errorMessage, or markdown; the server sets status=ready.",
  {
    product_id: z.string(),
    round: z.enum(["R1", "R2", "R3", "R4"]),
    lead: RawLeadInputSchema.omit({
      product_id: true,
      round: true,
      companyIntelligence: true,
    }).extend({
      companyIntelligence: z
        .unknown()
        .describe(
          "Exactly these non-empty string keys: businessModel, productsBrands, targetMarket, supplyChain, industryPosition, collabOpportunity, icebreak. Use 暂无公开信息 when a fact is not public. Extra keys fail the call and nothing is stored.",
        ),
    }),
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

    const { companyIntelligence, ...rest } = lead;
    const saved = appendRawLeadFromTool(
      root,
      product_id,
      round,
      { ...rest, product_id, round },
      companyIntelligence,
    );
    if (!saved.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "INVALID_COMPANY_INTELLIGENCE",
              message: saved.message,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              lead_id: saved.lead.id,
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
  "lead_set_company_intelligence",
  "Overwrite companyIntelligence on an existing lead from the current explore session. Does not create a lead, does not call a model, and does not change company, contacts, people, score, or lifecycle status. Same-domain re-hit only. Invalid fields set status=failed, restore the previous portrait text, and return an error.",
  {
    product_id: z.string(),
    lead_id: z.string(),
    businessModel: z.unknown().optional(),
    productsBrands: z.unknown().optional(),
    targetMarket: z.unknown().optional(),
    supplyChain: z.unknown().optional(),
    industryPosition: z.unknown().optional(),
    collabOpportunity: z.unknown().optional(),
    icebreak: z.unknown().optional(),
  },
  async ({
    product_id,
    lead_id,
    businessModel,
    productsBrands,
    targetMarket,
    supplyChain,
    industryPosition,
    collabOpportunity,
    icebreak,
  }) => {
    const root = getProjectRoot();
    const result = setLeadCompanyIntelligence(root, product_id, lead_id, {
      businessModel,
      productsBrands,
      targetMarket,
      supplyChain,
      industryPosition,
      collabOpportunity,
      icebreak,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: result.message === "未找到线索" ? "NOT_FOUND" : "INVALID_COMPANY_INTELLIGENCE",
              message: result.message,
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              lead_id: result.leadId,
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
  "List raw leads for a product, optionally filtered by round and/or run_id.",
  {
    product_id: z.string(),
    round: z.enum(["R1", "R2", "R3", "R4"]).optional(),
    run_id: z.string().optional(),
  },
  async ({ product_id, round, run_id }) => {
    const root = getProjectRoot();
    const leads = listRawLeads(root, product_id, round, run_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              product_id,
              round: round ?? null,
              run_id: run_id ?? null,
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

    const leads = listRawLeads(root, product_id, undefined, run_id);
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

server.tool(
  "leads_score_and_dedupe",
  "Score and dedupe raw leads; save kept leads to scored.json and domain duplicates to discarded.json",
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    try {
      const result = scoreAndDedupeLeads(root, product_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                product_id,
                scored_path: `data/leads/${product_id}/scored.json`,
                discarded_path: `data/leads/${product_id}/discarded.json`,
                raw_total: result.raw_total,
                deduped_total: result.deduped_total,
                discarded_total: result.discarded_total,
                stats: result.scored.stats,
                discarded_stats: result.discarded.stats,
                top_leads: result.scored.leads.slice(0, 5).map((lead) => ({
                  id: lead.id,
                  company: lead.company.name,
                  score: lead.score,
                  tier: lead.tier,
                  dedupe_key: lead.dedupe_key,
                })),
                discarded_sample: result.discarded.leads.slice(0, 5).map((lead) => ({
                  id: lead.id,
                  company: lead.company.name,
                  dedupe_key: lead.dedupe_key,
                  kept_lead_id: lead.kept_lead_id,
                  reason: lead.reason,
                })),
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
            text: JSON.stringify({ error: true, code: "SCORING_FAILED", message }),
          },
        ],
      };
    }
  }
);

server.tool(
  "leads_get_scored",
  "Load scored leads for a product.",
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const scored = loadScoredLeads(root, product_id);
    if (!scored) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Scored leads not found: ${product_id}`,
            }),
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(scored, null, 2) }],
    };
  }
);

server.tool(
  "leads_patch_scored",
  "Patch a scored lead's people[] with enriched contacts (e.g. from Hunter). Does NOT overwrite existing contacts[]. Optional sync_valid_to_contacts appends hunter_valid personal emails to contacts[].",
  {
    product_id: z.string().describe("Product ID, e.g. prod_20260712_001"),
    lead_id: z.string().describe("Lead ID to patch, e.g. lead_20260709_0001"),
    people: z.array(PersonInputSchema).describe("Enriched contacts to add (no limit, sorted by priority)"),
    sync_valid_to_contacts: z
      .boolean()
      .default(false)
      .describe("When true, append hunter_valid personal emails (confidence>=70) to contacts[]"),
  },
  async ({ product_id, lead_id, people, sync_valid_to_contacts }) => {
    const root = getProjectRoot();
    try {
      const result = patchScoredLead(root, product_id, lead_id, people, {
        sync_valid_to_contacts,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                product_id,
                lead_id: result.lead_id,
                people_added: result.people_added,
                people_updated: result.people_updated,
                people_total: result.people_total,
                contacts_appended: result.contacts_appended,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes("not found") ? "NOT_FOUND" : "PATCH_FAILED";
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
  "email_draft_plan",
  "Plan 1+N outreach draft slots for scored leads (company + up to 5 person contacts). Does NOT write draft bodies — agent must compose and email_draft_save each slot.",
  {
    product_id: z.string(),
    lead_ids: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).default(5),
  },
  async ({ product_id, lead_ids, limit }) => {
    const root = getProjectRoot();
    try {
      const result = planEmailDraftsForProduct(root, product_id, {
        lead_ids,
        limit,
      });
      const slot_count = result.plans.reduce(
        (sum, plan) => sum + 1 + plan.persons.length,
        0
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                product_id,
                lead_count: result.plans.length,
                slot_count,
                skipped: result.skipped,
                warnings: result.warnings,
                plans: result.plans.map((plan) => ({
                  lead_id: plan.lead_id,
                  product_id: plan.product_id,
                  language: plan.language,
                  personalization_hints: plan.personalization_hints,
                  truncated_person_count: plan.truncated_person_count,
                  slots: flattenPlanSlots(plan),
                })),
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
            text: JSON.stringify({ error: true, code: "EMAIL_DRAFT_PLAN_FAILED", message }),
          },
        ],
      };
    }
  }
);

server.tool(
  "email_draft_plan_slot",
  "Plan a single draft slot (company or person). Person email may exist only in people[]. Agent must compose then email_draft_save.",
  {
    product_id: z.string(),
    lead_id: z.string(),
    audience: z.enum(["company", "person"]),
    email: z.string().optional(),
    recipient_key: z.string().optional(),
  },
  async ({ product_id, lead_id, audience, email, recipient_key }) => {
    const root = getProjectRoot();
    try {
      const result = planEmailDraftSlotForProduct(root, product_id, lead_id, {
        audience,
        email,
        recipient_key,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, ...result }, null, 2),
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
            text: JSON.stringify({
              error: true,
              code: "EMAIL_DRAFT_PLAN_SLOT_FAILED",
              message,
            }),
          },
        ],
      };
    }
  }
);

server.tool(
  "email_draft_generate",
  "DEPRECATED: no longer writes template bodies. Returns the same payload as email_draft_plan. Use email_draft_plan then email_draft_save.",
  {
    product_id: z.string(),
    lead_ids: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).default(5),
    write_markdown: z.boolean().default(true),
  },
  async ({ product_id, lead_ids, limit }) => {
    const root = getProjectRoot();
    try {
      const result = planEmailDraftsForProduct(root, product_id, {
        lead_ids,
        limit,
      });
      const slot_count = result.plans.reduce(
        (sum, plan) => sum + 1 + plan.persons.length,
        0
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                deprecated: true,
                message:
                  "email_draft_generate no longer writes drafts. Use email_draft_plan then email_draft_save for each slot.",
                product_id,
                lead_count: result.plans.length,
                slot_count,
                skipped: result.skipped,
                warnings: result.warnings,
                plans: result.plans.map((plan) => ({
                  lead_id: plan.lead_id,
                  product_id: plan.product_id,
                  language: plan.language,
                  personalization_hints: plan.personalization_hints,
                  truncated_person_count: plan.truncated_person_count,
                  slots: flattenPlanSlots(plan),
                })),
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
            text: JSON.stringify({ error: true, code: "EMAIL_DRAFT_FAILED", message }),
          },
        ],
      };
    }
  }
);

server.tool(
  "email_draft_get",
  "Load an email draft by lead ID. Optional recipient_key selects a person slot; omit for company draft.",
  {
    lead_id: z.string(),
    recipient_key: z.string().optional(),
  },
  async ({ lead_id, recipient_key }) => {
    const root = getProjectRoot();
    const slot = slotFromRecipientKey(recipient_key);
    const draft = loadEmailDraftSlot(root, lead_id, slot);
    if (!draft) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "NOT_FOUND",
              message: `Email draft not found for lead: ${lead_id}${
                recipient_key ? ` recipient_key=${recipient_key}` : ""
              }`,
            }),
          },
        ],
      };
    }
    const draft_path =
      slot.kind === "company"
        ? `data/emails/${lead_id}/draft.json`
        : `data/emails/${lead_id}/${slot.recipientKey}/draft.json`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...draft, draft_path, recipient_key: recipientKeyFromSlot(slot) }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "email_draft_save",
  "Save or update an email draft manually (e.g. after agent refinement). Optional recipient_key selects person slot.",
  {
    lead_id: z.string(),
    recipient_key: z.string().optional(),
    draft: z.record(z.unknown()),
    write_markdown: z.boolean().default(true),
  },
  async ({ lead_id, recipient_key, draft, write_markdown }) => {
    const root = getProjectRoot();
    const slot = slotFromRecipientKey(recipient_key);
    const saved = saveEmailDraftSlot(
      root,
      lead_id,
      slot,
      {
        ...draft,
        lead_id,
      },
      write_markdown
    );

    const draft_path =
      slot.kind === "company"
        ? `data/emails/${lead_id}/draft.json`
        : `data/emails/${lead_id}/${slot.recipientKey}/draft.json`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              lead_id,
              recipient_key: recipientKeyFromSlot(slot),
              draft_path,
              markdown_path: write_markdown
                ? draft_path.replace(/draft\.json$/, "draft.md")
                : null,
              draft: saved,
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
  "email_draft_save_zh",
  "Save Chinese review contrast (subject_zh/body_zh) for an existing draft slot only. Does NOT change English subject/body/status. Use after translate-outreach-email.",
  {
    lead_id: z.string(),
    recipient_key: z.string().optional(),
    subject_zh: z.string(),
    body_zh: z.string(),
    product_id: z.string().optional(),
  },
  async ({ lead_id, recipient_key, subject_zh, body_zh, product_id }) => {
    void product_id;
    const root = getProjectRoot();
    const slot = slotFromRecipientKey(recipient_key);
    const result = saveEmailDraftZh(root, lead_id, slot, {
      subject_zh,
      body_zh,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "email_draft_list",
  "List email drafts (one summary row per lead), optionally filtered by product ID. Migrates legacy dual-variant drafts in place.",
  {
    product_id: z.string().optional(),
  },
  async ({ product_id }) => {
    const root = getProjectRoot();
    const summaries = listEmailDraftLeadSummaries(root, product_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              product_id: product_id ?? null,
              total: summaries.length,
              drafts: summaries.map((row) => ({
                lead_id: row.lead_id,
                company: row.company_name,
                subject: row.subject,
                recipient: row.recipient_email,
                audience: row.has_company_draft ? "company" : "person",
                has_company_draft: row.has_company_draft,
                person_draft_count: row.person_draft_count,
                draft_count: row.draft_count,
                status: row.status,
                draft_path: row.representative_path,
                slots: row.slots.map((s) => ({
                  recipient_key: s.recipient_key,
                  audience: s.audience,
                  email: s.email,
                  subject: s.subject,
                  status: s.status,
                  draft_path: s.draft_path,
                })),
              })),
            },
            null,
            2
          ),
        },
      ],
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
