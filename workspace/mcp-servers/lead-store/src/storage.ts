import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ProductProfile, ProductProfileInput } from "./profile-types.js";
import { ProductProfileSchema } from "./profile-types.js";
import {
  buildFollowUpQuestions,
  computeReadiness,
  parseReadinessThreshold,
  resolveStatus,
} from "./readiness.js";
import { generateProductId } from "./product-id.js";
import {
  findProjectRoot,
  getConfigPath,
  getInputsDir,
  getKeywordsPath,
  getProductDir,
  getProfilePath,
} from "./paths.js";
import {
  KeywordExpansionWriteSchema,
  SearchQueryWriteSchema,
  type KeywordExpansion,
  type KeywordExpansionInput,
} from "./keyword-types.js";
import { KeywordExpansionSchema } from "./keyword-types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function readThreshold(root: string): number {
  const configPath = getConfigPath(root);
  if (!existsSync(configPath)) {
    return 60;
  }
  const text = readFileSync(configPath, "utf8");
  return parseReadinessThreshold(text);
}

export function loadProfile(root: string, productId: string): ProductProfile | null {
  const profilePath = getProfilePath(root, productId);
  if (!existsSync(profilePath)) {
    return null;
  }
  const raw = JSON.parse(readFileSync(profilePath, "utf8"));
  return ProductProfileSchema.parse(raw);
}

export function saveProfile(
  root: string,
  input: ProductProfileInput,
  productId?: string
): {
  profile: ProductProfile;
  follow_up_questions: string[];
  created: boolean;
} {
  const resolvedId = productId ?? input.id ?? generateProductId(root);
  const existing = loadProfile(root, resolvedId);
  const threshold = readThreshold(root);
  const timestamp = nowIso();

  const merged = {
    id: resolvedId,
    version: existing?.version ?? 1,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
    company: {
      ...existing?.company,
      ...input.company,
    },
    products: input.products ?? existing?.products ?? [],
    buyer_personas: input.buyer_personas ?? existing?.buyer_personas ?? [],
    target_markets: {
      ...existing?.target_markets,
      ...input.target_markets,
    },
    competitors: input.competitors ?? existing?.competitors ?? [],
    source_inputs: input.source_inputs ?? existing?.source_inputs ?? [],
  };

  const readiness = computeReadiness(merged);
  const status = input.status ?? resolveStatus(readiness, threshold);

  const profile: ProductProfile = ProductProfileSchema.parse({
    ...merged,
    status,
    readiness,
  });

  const profilePath = getProfilePath(root, resolvedId);
  mkdirSync(dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  return {
    profile,
    follow_up_questions: buildFollowUpQuestions(readiness.missing_fields),
    created: !existing,
  };
}

export function listProfiles(root: string): ProductProfile[] {
  const productsDir = getProductDir(root, "");
  const parent = dirname(productsDir);

  let entries: string[] = [];
  try {
    entries = readDirNames(parent);
  } catch {
    return [];
  }

  return entries
    .filter((name) => name !== "_example")
    .map((name) => loadProfile(root, name))
    .filter((profile): profile is ProductProfile => profile !== null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function readDirNames(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function ensureInputsDir(root: string, productId: string): string {
  const inputsDir = getInputsDir(root, productId);
  mkdirSync(inputsDir, { recursive: true });
  return inputsDir;
}

export function loadKeywords(root: string, productId: string): KeywordExpansion | null {
  const keywordsPath = getKeywordsPath(root, productId);
  if (!existsSync(keywordsPath)) {
    return null;
  }
  const raw = JSON.parse(readFileSync(keywordsPath, "utf8"));
  return KeywordExpansionSchema.parse(raw);
}

export function saveKeywords(
  root: string,
  productId: string,
  input: KeywordExpansionInput
): KeywordExpansion {
  const timestamp = input.generated_at ?? nowIso();
  const search_queries = input.search_queries.map((query, index) =>
    SearchQueryWriteSchema.parse({
      ...query,
      id: query.id || `q_${String(index + 1).padStart(3, "0")}`,
    }),
  );

  const expansion: KeywordExpansion = KeywordExpansionWriteSchema.parse({
    product_id: productId,
    generated_at: timestamp,
    dimensions: input.dimensions,
    search_queries,
    stats: input.stats ?? {
      total_queries: search_queries.length,
      by_round: search_queries.reduce<Record<string, number>>((acc, query) => {
        acc[query.round] = (acc[query.round] ?? 0) + 1;
        return acc;
      }, {}),
      by_dimension: search_queries.reduce<Record<string, number>>((acc, query) => {
        acc[query.dimension] = (acc[query.dimension] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });

  const keywordsPath = getKeywordsPath(root, productId);
  mkdirSync(dirname(keywordsPath), { recursive: true });
  writeFileSync(keywordsPath, `${JSON.stringify(expansion, null, 2)}\n`, "utf8");
  return expansion;
}

export function getProjectRoot(): string {
  return findProjectRoot();
}
