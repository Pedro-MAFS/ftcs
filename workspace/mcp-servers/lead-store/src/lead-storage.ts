import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExplorationRun, RawLead, RawLeadInput } from "./lead-types.js";
import { ExplorationRunSchema, RawLeadSchema } from "./lead-types.js";
import { generateLeadId, generateRunId, normalizeDomain } from "./lead-id.js";
import {
  getExplorationRunPath,
  getExplorationRunsDir,
  getRawLeadsPath,
  getScoredLeadsPath,
} from "./paths.js";
import type { ScoredLead, ScoredLeadsFile } from "./lead-types.js";
import { ScoredLeadsFileSchema } from "./lead-types.js";
import {
  buildScoredStats,
  dedupeRawLeads,
  getDedupeKey,
  rawLeadToScoredLead,
  sortScoredLeads,
} from "./lead-scorer.js";
import { loadScoringConfig } from "./scoring-config.js";
import { loadProfile } from "./storage.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function appendRawLead(
  root: string,
  productId: string,
  round: RawLead["round"],
  input: RawLeadInput
): RawLead {
  const lead: RawLead = RawLeadSchema.parse({
    ...input,
    id: input.id ?? generateLeadId(root),
    product_id: productId,
    discovered_at: input.discovered_at ?? nowIso(),
    round,
  });

  const rawPath = getRawLeadsPath(root, productId, round);
  mkdirSync(dirname(rawPath), { recursive: true });
  appendFileSync(rawPath, `${JSON.stringify(lead)}\n`, "utf8");
  return lead;
}

export function listRawLeads(root: string, productId: string, round?: RawLead["round"]): RawLead[] {
  const rounds = round ? [round] : ["R1", "R2", "R3", "R4"];
  const leads: RawLead[] = [];

  for (const roundId of rounds) {
    const rawPath = getRawLeadsPath(root, productId, roundId);
    if (!existsSync(rawPath)) {
      continue;
    }
    const lines = readFileSync(rawPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      leads.push(RawLeadSchema.parse(JSON.parse(line)));
    }
  }

  return leads;
}

export function countUniqueLeadDomains(leads: RawLead[]): number {
  const domains = new Set<string>();
  for (const lead of leads) {
    const domain =
      normalizeDomain(lead.company.website ?? lead.source.url) ??
      lead.company.name?.toLowerCase();
    if (domain) {
      domains.add(domain);
    }
  }
  return domains.size;
}

export function createExplorationRun(
  root: string,
  productId: string,
  rounds: ExplorationRun["rounds"]
): ExplorationRun {
  const run: ExplorationRun = ExplorationRunSchema.parse({
    id: generateRunId(root),
    product_id: productId,
    started_at: nowIso(),
    finished_at: null,
    status: "running",
    rounds,
    queries_executed: 0,
    leads_found: 0,
    api_usage: {
      search_calls: 0,
      crawl_pages: 0,
    },
    errors: [],
  });

  saveExplorationRun(root, productId, run);
  return run;
}

export function saveExplorationRun(
  root: string,
  productId: string,
  run: ExplorationRun
): ExplorationRun {
  const parsed = ExplorationRunSchema.parse(run);
  const runPath = getExplorationRunPath(root, productId, parsed.id);
  mkdirSync(dirname(runPath), { recursive: true });
  writeFileSync(runPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function loadExplorationRun(
  root: string,
  productId: string,
  runId: string
): ExplorationRun | null {
  const runPath = getExplorationRunPath(root, productId, runId);
  if (!existsSync(runPath)) {
    return null;
  }
  return ExplorationRunSchema.parse(JSON.parse(readFileSync(runPath, "utf8")));
}

export function listExplorationRuns(root: string, productId: string): ExplorationRun[] {
  const runsDir = getExplorationRunsDir(root, productId);
  if (!existsSync(runsDir)) {
    return [];
  }

  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      ExplorationRunSchema.parse(
        JSON.parse(readFileSync(getExplorationRunPath(root, productId, entry.name.replace(/\.json$/, "")), "utf8"))
      )
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function updateExplorationRun(
  root: string,
  productId: string,
  runId: string,
  patch: Partial<ExplorationRun>
): ExplorationRun {
  const existing = loadExplorationRun(root, productId, runId);
  if (!existing) {
    throw new Error(`Exploration run not found: ${runId}`);
  }

  const updated = ExplorationRunSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    product_id: existing.product_id,
    api_usage: {
      ...existing.api_usage,
      ...patch.api_usage,
    },
    errors: patch.errors ?? existing.errors,
  });

  return saveExplorationRun(root, productId, updated);
}

export function loadScoredLeads(root: string, productId: string): ScoredLeadsFile | null {
  const scoredPath = getScoredLeadsPath(root, productId);
  if (!existsSync(scoredPath)) {
    return null;
  }
  return ScoredLeadsFileSchema.parse(JSON.parse(readFileSync(scoredPath, "utf8")));
}

export function saveScoredLeads(root: string, file: ScoredLeadsFile): ScoredLeadsFile {
  const parsed = ScoredLeadsFileSchema.parse(file);
  const scoredPath = getScoredLeadsPath(root, parsed.product_id);
  mkdirSync(dirname(scoredPath), { recursive: true });
  writeFileSync(scoredPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function scoreAndDedupeLeads(root: string, productId: string): {
  scored: ScoredLeadsFile;
  raw_total: number;
  deduped_total: number;
} {
  const profile = loadProfile(root, productId);
  if (!profile) {
    throw new Error(`Product not found: ${productId}`);
  }

  const rawLeads = listRawLeads(root, productId);
  if (rawLeads.length === 0) {
    throw new Error(`No raw leads found for product: ${productId}`);
  }

  const config = loadScoringConfig(root);
  const deduped = dedupeRawLeads(rawLeads);
  const existing = loadScoredLeads(root, productId);

  const preservedStatusByKey = new Map<string, ScoredLead["status"]>();
  const preservedStatusById = new Map<string, ScoredLead["status"]>();
  for (const lead of existing?.leads ?? []) {
    preservedStatusByKey.set(lead.dedupe_key, lead.status);
    preservedStatusById.set(lead.id, lead.status);
  }

  const scoredLeads = sortScoredLeads(
    deduped.map((lead) => {
      const dedupeKey = getDedupeKey(lead);
      const preserved =
        preservedStatusById.get(lead.id) ??
        preservedStatusByKey.get(dedupeKey);
      return rawLeadToScoredLead(profile, lead, config, preserved);
    })
  );

  const scored: ScoredLeadsFile = {
    product_id: productId,
    updated_at: nowIso(),
    leads: scoredLeads,
    stats: buildScoredStats(scoredLeads),
  };

  saveScoredLeads(root, scored);

  return {
    scored,
    raw_total: rawLeads.length,
    deduped_total: deduped.length,
  };
}
