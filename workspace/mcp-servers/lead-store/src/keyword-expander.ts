import type { ProductProfile } from "./profile-types.js";
import type { KeywordDimension, KeywordExpansion, SearchQuery } from "./keyword-types.js";

const MAX_QUERIES = 50;

const ROUND_RATIOS: Record<SearchQuery["round"], number> = {
  R1: 0.6,
  R2: 0.2,
  R3: 0.15,
  R4: 0.05,
};

const REGION_COUNTRIES: Record<string, string[]> = {
  EU: ["Germany", "France", "UK", "Netherlands", "Italy", "Spain"],
  NA: ["USA", "Canada"],
  SEA: ["Singapore", "Thailand", "Vietnam", "Indonesia", "Malaysia"],
  AU: ["Australia", "New Zealand"],
  ME: ["UAE", "Saudi Arabia"],
  SA: ["Brazil", "Mexico"],
  CN: ["China"],
  AF: ["South Africa", "Nigeria"],
};

const COMPANY_TYPE_LABELS: Record<string, string[]> = {
  distributor: ["distributor", "wholesaler"],
  retailer: ["retailer", "retail store"],
  OEM: ["OEM", "manufacturer"],
  engineering_company: ["engineering company", "contractor"],
  landscape_contractor: ["landscape contractor", "landscaping company"],
  building_materials_chain: ["building materials supplier", "hardware chain"],
  landscape_designer: ["landscape designer", "landscape architect"],
  property_developer: ["property developer", "real estate developer"],
};

interface QueryCandidate {
  query: string;
  dimension: KeywordDimension;
  language: string;
  priority: SearchQuery["priority"];
  round: SearchQuery["round"];
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function detectLanguage(query: string): string {
  return hasChinese(query) ? "zh" : "en";
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function uniqueQueries(candidates: QueryCandidate[]): QueryCandidate[] {
  const seen = new Set<string>();
  const result: QueryCandidate[] = [];

  for (const candidate of candidates) {
    const query = normalizeQuery(candidate.query);
    if (!query) {
      continue;
    }
    const key = query.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...candidate, query, language: detectLanguage(query) });
  }

  return result;
}

function primaryProductNames(profile: ProductProfile): string[] {
  const names = new Set<string>();
  for (const product of profile.products) {
    if (product.name_en) {
      names.add(product.name_en);
    }
    if (product.name && !hasChinese(product.name)) {
      names.add(product.name);
    }
  }
  return [...names];
}

function allUseCases(profile: ProductProfile): string[] {
  const cases = new Set<string>();
  for (const product of profile.products) {
    for (const useCase of product.use_cases ?? []) {
      cases.add(useCase);
    }
  }
  return [...cases];
}

function allCategories(profile: ProductProfile): string[] {
  const categories = new Set<string>();
  for (const product of profile.products) {
    if (product.category) {
      categories.add(product.category);
    }
  }
  return [...categories];
}

function targetRegions(profile: ProductProfile): string[] {
  const regions = profile.target_markets?.regions ?? [];
  if (regions.length > 0) {
    return regions;
  }

  const personaRegions = new Set<string>();
  for (const persona of profile.buyer_personas) {
    for (const region of persona.regions ?? []) {
      personaRegions.add(region);
    }
  }
  return personaRegions.size > 0 ? [...personaRegions] : ["EU", "NA"];
}

function targetCountries(profile: ProductProfile): string[] {
  const countries = new Set<string>();
  for (const region of targetRegions(profile)) {
    for (const country of REGION_COUNTRIES[region] ?? [region]) {
      countries.add(country);
    }
  }
  return [...countries];
}

function buyerCompanyTypes(profile: ProductProfile): string[] {
  const types = new Set<string>();
  for (const persona of profile.buyer_personas) {
    for (const companyType of persona.company_types ?? []) {
      types.add(companyType);
    }
  }
  return types.size > 0 ? [...types] : ["distributor", "importer"];
}

function addCandidate(
  bucket: QueryCandidate[],
  query: string,
  dimension: KeywordDimension,
  priority: SearchQuery["priority"],
  round: SearchQuery["round"]
): void {
  bucket.push({ query, dimension, language: detectLanguage(query), priority, round });
}

function buildProductCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);
  const categories = allCategories(profile);

  for (const name of names) {
    addCandidate(candidates, `${name} supplier`, "product", "medium", "R1");
    addCandidate(candidates, `${name} manufacturer China`, "product", "medium", "R1");
    addCandidate(candidates, `${name} exporter`, "product", "medium", "R1");
    addCandidate(candidates, `${name} factory`, "product", "low", "R1");
  }

  for (const product of profile.products) {
    if (product.name && hasChinese(product.name)) {
      addCandidate(candidates, `${product.name} 出口`, "product", "medium", "R1");
      addCandidate(candidates, `${product.name} 供应商`, "product", "medium", "R1");
    }
    if (product.hs_code && product.name_en) {
      addCandidate(
        candidates,
        `${product.hs_code} ${product.name_en} importer`,
        "product",
        "high",
        "R2"
      );
    }
  }

  for (const category of categories) {
    addCandidate(candidates, `${category} wholesale supplier`, "product", "medium", "R1");
    addCandidate(candidates, `${category} manufacturer`, "product", "medium", "R1");
  }

  return candidates;
}

function buildScenarioCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);
  const useCases = allUseCases(profile);

  for (const useCase of useCases) {
    for (const name of names.slice(0, 2)) {
      addCandidate(candidates, `${useCase} ${name} supplier`, "scenario", "medium", "R1");
      addCandidate(candidates, `${useCase} ${name} distributor`, "scenario", "medium", "R1");
      addCandidate(candidates, `${useCase} ${name} materials importer`, "scenario", "high", "R2");
    }
  }

  return candidates;
}

function buildBuyerCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);
  const categories = allCategories(profile);
  const companyTypes = buyerCompanyTypes(profile);

  for (const name of names) {
    addCandidate(candidates, `${name} importer`, "buyer", "high", "R2");
    addCandidate(candidates, `${name} wholesaler`, "buyer", "high", "R1");
    addCandidate(candidates, `${name} distributor wanted`, "buyer", "high", "R1");
  }

  for (const companyType of companyTypes) {
    const labels = COMPANY_TYPE_LABELS[companyType] ?? [companyType.replaceAll("_", " ")];
    for (const label of labels) {
      for (const name of names.slice(0, 2)) {
        addCandidate(candidates, `${label} ${name}`, "buyer", "high", "R1");
      }
      for (const category of categories.slice(0, 1)) {
        addCandidate(candidates, `${label} ${category}`, "buyer", "medium", "R1");
      }
    }
  }

  for (const persona of profile.buyer_personas) {
    if (persona.role) {
      for (const name of names.slice(0, 1)) {
        addCandidate(
          candidates,
          `${persona.role.replaceAll("_", " ")} ${name}`,
          "buyer",
          "medium",
          "R3"
        );
      }
    }
  }

  return candidates;
}

function buildGeoCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);
  const countries = targetCountries(profile);

  for (const country of countries) {
    for (const name of names.slice(0, 2)) {
      addCandidate(candidates, `${name} importer ${country}`, "geo", "high", "R1");
      addCandidate(candidates, `${name} distributor ${country}`, "geo", "high", "R1");
      addCandidate(candidates, `${name} wholesaler ${country}`, "geo", "medium", "R1");
      addCandidate(candidates, `buy ${name} ${country}`, "geo", "medium", "R2");
    }
  }

  return candidates;
}

function buildCompetitorCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);

  for (const competitor of profile.competitors) {
    if (!competitor.name) {
      continue;
    }
    addCandidate(
      candidates,
      `alternatives to ${competitor.name}`,
      "competitor",
      "medium",
      "R3"
    );
    addCandidate(
      candidates,
      `companies buying from ${competitor.name}`,
      "competitor",
      "high",
      "R3"
    );
    addCandidate(
      candidates,
      `${competitor.name} customers list`,
      "competitor",
      "medium",
      "R3"
    );
  }

  if (profile.competitors.length === 0) {
    for (const name of names.slice(0, 1)) {
      for (const category of allCategories(profile).slice(0, 1)) {
        addCandidate(
          candidates,
          `top ${name} competitors`,
          "competitor",
          "low",
          "R3"
        );
        addCandidate(
          candidates,
          `${category} leading brands`,
          "competitor",
          "low",
          "R3"
        );
      }
    }
  }

  return candidates;
}

function buildMonitorCandidates(profile: ProductProfile): QueryCandidate[] {
  const candidates: QueryCandidate[] = [];
  const names = primaryProductNames(profile);
  const regions = targetRegions(profile);

  for (const name of names.slice(0, 1)) {
    for (const region of regions.slice(0, 3)) {
      addCandidate(
        candidates,
        `${name} new distributor ${region}`,
        "buyer",
        "low",
        "R4"
      );
      addCandidate(
        candidates,
        `${name} procurement announcement ${region}`,
        "buyer",
        "low",
        "R4"
      );
    }
  }

  if (profile.company.name) {
    for (const name of names.slice(0, 1)) {
      addCandidate(
        candidates,
        `${profile.company.name} ${name} buyer`,
        "product",
        "low",
        "R4"
      );
    }
  }

  return candidates;
}

const PRIORITY_WEIGHT: Record<SearchQuery["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function selectQueries(candidates: QueryCandidate[]): SearchQuery[] {
  const unique = uniqueQueries(candidates);
  const selected: QueryCandidate[] = [];
  const roundCounts: Record<SearchQuery["round"], number> = {
    R1: 0,
    R2: 0,
    R3: 0,
    R4: 0,
  };

  const roundLimits: Record<SearchQuery["round"], number> = {
    R1: Math.floor(MAX_QUERIES * ROUND_RATIOS.R1),
    R2: Math.floor(MAX_QUERIES * ROUND_RATIOS.R2),
    R3: Math.floor(MAX_QUERIES * ROUND_RATIOS.R3),
    R4: Math.max(
      1,
      MAX_QUERIES -
        Math.floor(MAX_QUERIES * ROUND_RATIOS.R1) -
        Math.floor(MAX_QUERIES * ROUND_RATIOS.R2) -
        Math.floor(MAX_QUERIES * ROUND_RATIOS.R3)
    ),
  };

  const sorted = [...unique].sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.query.length - b.query.length;
  });

  const dimensions: KeywordDimension[] = [
    "product",
    "scenario",
    "buyer",
    "geo",
    "competitor",
  ];

  for (const dimension of dimensions) {
    const perDimension = sorted.filter((candidate) => candidate.dimension === dimension);
    for (const candidate of perDimension.slice(0, 3)) {
      if (selected.length >= MAX_QUERIES) {
        break;
      }
      if (roundCounts[candidate.round] >= roundLimits[candidate.round]) {
        continue;
      }
      const exists = selected.some(
        (item) => item.query.toLowerCase() === candidate.query.toLowerCase()
      );
      if (exists) {
        continue;
      }
      roundCounts[candidate.round] += 1;
      selected.push(candidate);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= MAX_QUERIES) {
      break;
    }
    const exists = selected.some(
      (item) => item.query.toLowerCase() === candidate.query.toLowerCase()
    );
    if (exists) {
      continue;
    }
    if (roundCounts[candidate.round] >= roundLimits[candidate.round]) {
      continue;
    }
    roundCounts[candidate.round] += 1;
    selected.push(candidate);
  }

  if (selected.length < 30) {
    for (const candidate of sorted) {
      if (selected.length >= MAX_QUERIES) {
        break;
      }
      const exists = selected.some(
        (item) => item.query.toLowerCase() === candidate.query.toLowerCase()
      );
      if (!exists) {
        selected.push(candidate);
      }
    }
  }

  return selected.map((candidate, index) => ({
    id: `q_${String(index + 1).padStart(3, "0")}`,
    query: candidate.query,
    dimension: candidate.dimension,
    language: candidate.language,
    priority: candidate.priority,
    round: candidate.round,
  }));
}

function collectDimensionKeywords(candidates: QueryCandidate[]): KeywordExpansion["dimensions"] {
  const dimensions: KeywordExpansion["dimensions"] = {
    product: [],
    scenario: [],
    buyer: [],
    geo: [],
    competitor: [],
  };

  for (const candidate of uniqueQueries(candidates)) {
    const bucket = dimensions[candidate.dimension];
    if (!bucket.includes(candidate.query)) {
      bucket.push(candidate.query);
    }
  }

  return dimensions;
}

function buildStats(queries: SearchQuery[]): KeywordExpansion["stats"] {
  const by_round: Record<string, number> = { R1: 0, R2: 0, R3: 0, R4: 0 };
  const by_dimension: Record<string, number> = {
    product: 0,
    scenario: 0,
    buyer: 0,
    geo: 0,
    competitor: 0,
  };

  for (const query of queries) {
    by_round[query.round] = (by_round[query.round] ?? 0) + 1;
    by_dimension[query.dimension] = (by_dimension[query.dimension] ?? 0) + 1;
  }

  return {
    total_queries: queries.length,
    by_round,
    by_dimension,
  };
}

export function expandKeywords(profile: ProductProfile, generatedAt = new Date().toISOString()): KeywordExpansion {
  const candidates = [
    ...buildProductCandidates(profile),
    ...buildScenarioCandidates(profile),
    ...buildBuyerCandidates(profile),
    ...buildGeoCandidates(profile),
    ...buildCompetitorCandidates(profile),
    ...buildMonitorCandidates(profile),
  ];

  const search_queries = selectQueries(candidates);

  return {
    product_id: profile.id,
    generated_at: generatedAt,
    dimensions: collectDimensionKeywords(candidates),
    search_queries,
    stats: buildStats(search_queries),
  };
}

export function assertProfileReadyForExpansion(profile: ProductProfile): string | null {
  if (profile.status !== "ready") {
    return `Product profile status is "${profile.status}". Complete profile to "ready" before keyword expansion.`;
  }
  if (profile.products.length === 0) {
    return "Product profile has no products. Add at least one product before keyword expansion.";
  }
  return null;
}
