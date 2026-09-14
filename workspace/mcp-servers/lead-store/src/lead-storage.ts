import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DiscardedLead,
  DiscardedLeadsFile,
  ExplorationRun,
  RawLead,
  RawLeadInput,
  ScoredLead,
  ScoredLeadsFile,
} from "./lead-types.js";
import {
  DiscardedLeadsFileSchema,
  ExplorationRunSchema,
  RawLeadSchema,
  ScoredLeadsFileSchema,
} from "./lead-types.js";
import { generateLeadId, generateRunId, normalizeDomain } from "./lead-id.js";
import { generatePersonId } from "./person-id.js";
import { comparePersons, type PersonInput } from "./person-types.js";
import {
  getDiscardedLeadsPath,
  getExplorationRunPath,
  getExplorationRunsDir,
  getRawLeadsPath,
  getScoredLeadsPath,
} from "./paths.js";
import {
  buildScoredStats,
  dedupeRawLeadsDetailed,
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

export function listRawLeads(
  root: string,
  productId: string,
  round?: RawLead["round"],
  runId?: string
): RawLead[] {
  const rounds = round ? [round] : ["R1", "R2", "R3", "R4"];
  const leads: RawLead[] = [];

  for (const roundId of rounds) {
    const rawPath = getRawLeadsPath(root, productId, roundId);
    if (!existsSync(rawPath)) {
      continue;
    }
    const lines = readFileSync(rawPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      const lead = RawLeadSchema.parse(JSON.parse(line));
      if (runId && lead.run_id !== runId) {
        continue;
      }
      leads.push(lead);
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

export function loadDiscardedLeads(
  root: string,
  productId: string
): DiscardedLeadsFile | null {
  const discardedPath = getDiscardedLeadsPath(root, productId);
  if (!existsSync(discardedPath)) {
    return null;
  }
  return DiscardedLeadsFileSchema.parse(JSON.parse(readFileSync(discardedPath, "utf8")));
}

export function saveDiscardedLeads(
  root: string,
  file: DiscardedLeadsFile
): DiscardedLeadsFile {
  const parsed = DiscardedLeadsFileSchema.parse(file);
  const discardedPath = getDiscardedLeadsPath(root, parsed.product_id);
  mkdirSync(dirname(discardedPath), { recursive: true });
  writeFileSync(discardedPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

function toDiscardedLead(entry: {
  lead: RawLead;
  dedupe_key: string;
  kept_lead_id: string;
  reason: "duplicate_domain";
}): DiscardedLead {
  return {
    id: entry.lead.id,
    product_id: entry.lead.product_id,
    dedupe_key: entry.dedupe_key,
    reason: entry.reason,
    kept_lead_id: entry.kept_lead_id,
    company: entry.lead.company,
    source: entry.lead.source,
    match_reason: entry.lead.match_reason,
    contacts: entry.lead.contacts,
    round: entry.lead.round,
    query_id: entry.lead.query_id,
    run_id: entry.lead.run_id,
    discovered_at: entry.lead.discovered_at,
    raw_score: entry.lead.raw_score,
  };
}

export function scoreAndDedupeLeads(root: string, productId: string): {
  scored: ScoredLeadsFile;
  discarded: DiscardedLeadsFile;
  raw_total: number;
  deduped_total: number;
  discarded_total: number;
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
  const { kept: deduped, discarded: discardedEntries } = dedupeRawLeadsDetailed(rawLeads);
  const existing = loadScoredLeads(root, productId);

  const preservedStatusByKey = new Map<string, ScoredLead["status"]>();
  const preservedStatusById = new Map<string, ScoredLead["status"]>();
  const preservedPeopleByKey = new Map<string, ScoredLead["people"]>();
  for (const lead of existing?.leads ?? []) {
    preservedStatusByKey.set(lead.dedupe_key, lead.status);
    preservedStatusById.set(lead.id, lead.status);
    if (lead.people && lead.people.length > 0) {
      preservedPeopleByKey.set(lead.dedupe_key, lead.people);
    }
  }

  const scoredLeads = sortScoredLeads(
    deduped.map((lead) => {
      const dedupeKey = getDedupeKey(lead);
      const preserved =
        preservedStatusById.get(lead.id) ??
        preservedStatusByKey.get(dedupeKey);
      const scored = rawLeadToScoredLead(profile, lead, config, preserved);
      scored.people = preservedPeopleByKey.get(dedupeKey) ?? [];
      return scored;
    })
  );

  const updatedAt = nowIso();
  const scored: ScoredLeadsFile = {
    product_id: productId,
    updated_at: updatedAt,
    leads: scoredLeads,
    stats: buildScoredStats(scoredLeads),
  };

  const discardedLeads = discardedEntries.map(toDiscardedLead);
  const discarded: DiscardedLeadsFile = {
    product_id: productId,
    updated_at: updatedAt,
    leads: discardedLeads,
    stats: { total: discardedLeads.length },
  };

  saveScoredLeads(root, scored);
  saveDiscardedLeads(root, discarded);

  return {
    scored,
    discarded,
    raw_total: rawLeads.length,
    deduped_total: deduped.length,
    discarded_total: discardedLeads.length,
  };
}

export function patchScoredLead(
  root: string,
  productId: string,
  leadId: string,
  people: PersonInput[]
): { success: true; lead_id: string; people_added: number; people_updated: number; people_total: number } {
  const scored = loadScoredLeads(root, productId);
  if (!scored) {
    throw new Error(`Scored leads not found for product: ${productId}`);
  }

  const leadIndex = scored.leads.findIndex((lead) => lead.id === leadId);
  if (leadIndex === -1) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const lead = scored.leads[leadIndex];
  const existingPeople = lead.people ?? [];
  const existingByEmail = new Map(existingPeople.map((person) => [person.email.toLowerCase(), person]));

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const input of people) {
    const emailKey = input.email.toLowerCase();
    const existing = existingByEmail.get(emailKey);

    if (existing) {
      // 更新已有条目（保留 id 和 enriched_at）
      const updatedPerson = {
        ...input,
        id: existing.id,
        enriched_at: existing.enriched_at,
      };
      existingByEmail.set(emailKey, updatedPerson);
      updated += 1;
    } else {
      // 新增条目
      const newPerson = {
        ...input,
        id: generatePersonId(root),
        enriched_at: now,
      };
      existingByEmail.set(emailKey, newPerson);
      added += 1;
    }
  }

  // 按邮箱质量排序（§6.3）
  const sortedPeople = [...existingByEmail.values()].sort(comparePersons);

  // 更新 lead
  lead.people = sortedPeople;
  scored.updated_at = now;

  saveScoredLeads(root, scored);

  return {
    success: true,
    lead_id: leadId,
    people_added: added,
    people_updated: updated,
    people_total: sortedPeople.length,
  };
}
