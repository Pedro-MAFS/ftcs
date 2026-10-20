import type { ProductProfile } from "./profile-types.js";
import type { RawLead, ScoreBreakdown, ScoredLead, ScoredLeadsFile } from "./lead-types.js";
import { normalizeDomain } from "./lead-id.js";
import {
  loadScoringConfig,
  resolveTier,
  weightedScore,
  type ScoringConfig,
} from "./scoring-config.js";

const PURCHASE_INTENT_KEYWORDS = [
  "importer",
  "import",
  "distributor",
  "distribution",
  "wholesaler",
  "wholesale",
  "dealer",
  "retailer",
  "procurement",
  "buyer",
  "reseller",
  "进口",
  "经销商",
  "分销",
  "批发",
  "采购",
];

const BUYER_TYPE_KEYWORDS = [
  "distributor",
  "retailer",
  "importer",
  "wholesaler",
  "contractor",
  "engineering",
  "developer",
  "landscape",
  "building materials",
];

const COMPETITOR_KEYWORDS = [
  "manufacturer china",
  "factory china",
  "supplier china",
  "exporter china",
  "中国工厂",
  "中国供应商",
  "生产厂家",
  "出口商",
];

const REGION_COUNTRIES: Record<string, string[]> = {
  EU: ["germany", "france", "uk", "united kingdom", "netherlands", "italy", "spain", "de", "fr", "nl", "it", "es"],
  NA: ["usa", "united states", "canada", "us", "ca"],
  SEA: ["singapore", "thailand", "vietnam", "indonesia", "malaysia", "sg", "th", "vn", "id", "my"],
  AU: ["australia", "new zealand", "au", "nz"],
  ME: ["uae", "saudi arabia", "qatar", "ae", "sa", "qa"],
  SA: ["brazil", "mexico", "br", "mx"],
};

const COUNTRY_TO_REGION: Record<string, string> = {
  de: "EU",
  germany: "EU",
  fr: "EU",
  france: "EU",
  uk: "EU",
  "united kingdom": "EU",
  nl: "EU",
  netherlands: "EU",
  it: "EU",
  italy: "EU",
  es: "EU",
  spain: "EU",
  us: "NA",
  usa: "NA",
  "united states": "NA",
  ca: "NA",
  canada: "NA",
  sg: "SEA",
  singapore: "SEA",
  th: "SEA",
  thailand: "SEA",
  vn: "SEA",
  vietnam: "SEA",
  au: "AU",
  australia: "AU",
  ae: "ME",
  uae: "ME",
  sa: "ME",
  "saudi arabia": "ME",
  br: "SA",
  brazil: "SA",
  mx: "SA",
  mexico: "SA",
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function combinedText(lead: RawLead): string {
  return [
    lead.match_reason,
    lead.source.snippet,
    lead.company.description,
    lead.company.name,
    lead.company.website,
    lead.company.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function collectProductKeywords(profile: ProductProfile): string[] {
  const keywords = new Set<string>();
  for (const product of profile.products) {
    if (product.name) {
      keywords.add(product.name.toLowerCase());
    }
    if (product.name_en) {
      keywords.add(product.name_en.toLowerCase());
    }
    if (product.category) {
      keywords.add(product.category.toLowerCase());
    }
    for (const useCase of product.use_cases ?? []) {
      keywords.add(useCase.toLowerCase());
    }
  }
  return [...keywords];
}

function countKeywordHits(text: string, keywords: string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (keyword.length >= 3 && text.includes(keyword)) {
      hits += 1;
    }
  }
  return hits;
}

function scoreProductMatch(profile: ProductProfile, lead: RawLead): number {
  const text = combinedText(lead);
  const keywords = collectProductKeywords(profile);
  const hits = countKeywordHits(text, keywords);

  if (hits >= 3) {
    return 95;
  }
  if (hits === 2) {
    return 85;
  }
  if (hits === 1) {
    return 75;
  }

  if (lead.raw_score !== undefined && lead.raw_score >= 70) {
    return clamp(lead.raw_score);
  }

  return 45;
}

function scorePurchaseIntent(lead: RawLead): number {
  const text = combinedText(lead);
  const hits = PURCHASE_INTENT_KEYWORDS.filter((keyword) => text.includes(keyword)).length;

  let score = 50 + hits * 12;
  if (lead.round === "R2") {
    score += 8;
  }
  if (lead.raw_score !== undefined) {
    score = Math.max(score, lead.raw_score * 0.9);
  }

  return clamp(score);
}

function scoreSizeFit(profile: ProductProfile, lead: RawLead): number {
  const text = combinedText(lead);
  const buyerTypes = profile.buyer_personas.flatMap((persona) => persona.company_types ?? []);
  const hits = buyerTypes.filter((type) => text.includes(type.replaceAll("_", " "))).length;

  if (hits > 0) {
    return clamp(70 + hits * 10);
  }

  const genericHits = BUYER_TYPE_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  return clamp(55 + genericHits * 10);
}

function resolveLeadRegion(lead: RawLead): string | null {
  const country = lead.company.country?.trim().toLowerCase();
  if (country && COUNTRY_TO_REGION[country]) {
    return COUNTRY_TO_REGION[country];
  }
  if (country && country.length === 2 && COUNTRY_TO_REGION[country]) {
    return COUNTRY_TO_REGION[country];
  }

  const text = combinedText(lead);
  for (const [token, region] of Object.entries(COUNTRY_TO_REGION)) {
    if (text.includes(token)) {
      return region;
    }
  }
  return null;
}

function scoreGeoMatch(profile: ProductProfile, lead: RawLead): number {
  const targetRegions = profile.target_markets?.regions ?? [];
  const leadRegion = resolveLeadRegion(lead);

  if (targetRegions.length === 0) {
    return leadRegion ? 75 : 60;
  }

  if (leadRegion && targetRegions.includes(leadRegion)) {
    return 92;
  }

  const text = combinedText(lead);
  for (const region of targetRegions) {
    const countries = REGION_COUNTRIES[region] ?? [];
    if (countries.some((country) => text.includes(country))) {
      return 85;
    }
  }

  return 40;
}

function scoreReachability(lead: RawLead): number {
  if (lead.contacts.length === 0) {
    return 35;
  }

  const email = lead.contacts.find((contact) => contact.type === "email");
  if (email) {
    if (email.confidence === "high") {
      return 95;
    }
    if (email.confidence === "medium") {
      return 80;
    }
    return 70;
  }

  const form = lead.contacts.find((contact) => contact.type === "form");
  if (form) {
    return 60;
  }

  return 50;
}

function scoreCompetition(profile: ProductProfile, lead: RawLead): number {
  const text = combinedText(lead);
  const sellerCountry = profile.company.country?.toLowerCase() ?? "cn";
  const leadCountry = lead.company.country?.toLowerCase() ?? "";

  const competitorHits = COMPETITOR_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  if (competitorHits >= 2) {
    return 25;
  }

  if (sellerCountry === "cn" && (leadCountry === "cn" || leadCountry === "china" || text.includes("china"))) {
    if (text.includes("manufacturer") || text.includes("factory") || text.includes("supplier")) {
      return 30;
    }
  }

  return 80;
}

export function buildScoreBreakdown(profile: ProductProfile, lead: RawLead): ScoreBreakdown {
  return {
    product_match: scoreProductMatch(profile, lead),
    purchase_intent: scorePurchaseIntent(lead),
    size_fit: scoreSizeFit(profile, lead),
    geo_match: scoreGeoMatch(profile, lead),
    reachability: scoreReachability(lead),
    competition: scoreCompetition(profile, lead),
  };
}

export function scoreRawLead(
  profile: ProductProfile,
  lead: RawLead,
  config: ScoringConfig = loadScoringConfig("")
): { score: number; score_breakdown: ScoreBreakdown; tier: ScoredLead["tier"] } {
  const score_breakdown = buildScoreBreakdown(profile, lead);
  const score = weightedScore(score_breakdown, config.weights);
  const tier = resolveTier(score, config.tiers);
  return { score, score_breakdown, tier };
}

export function getDedupeKey(lead: RawLead): string {
  return (
    normalizeDomain(lead.company.website ?? lead.source.url) ??
    lead.company.name?.trim().toLowerCase() ??
    lead.id
  );
}

function leadCompletenessScore(lead: RawLead): number {
  let score = lead.raw_score ?? 0;
  if (lead.company.name) {
    score += 5;
  }
  if (lead.company.website) {
    score += 5;
  }
  if (lead.contacts.length > 0) {
    score += 10;
  }
  score += Math.min(lead.match_reason.length / 20, 10);
  return score;
}

export type DedupeBucket = {
  kept: RawLead;
  discarded: RawLead[];
};

/** 按域名去重，并返回被淘汰的原始线索（含最终保留的 lead id） */
export function dedupeRawLeadsDetailed(leads: RawLead[]): {
  kept: RawLead[];
  discarded: Array<{
    lead: RawLead;
    dedupe_key: string;
    kept_lead_id: string;
    reason: "duplicate_domain";
  }>;
} {
  const byKey = new Map<string, DedupeBucket>();

  for (const lead of leads) {
    const key = getDedupeKey(lead);
    const bucket = byKey.get(key);
    if (!bucket) {
      byKey.set(key, { kept: lead, discarded: [] });
      continue;
    }
    if (leadCompletenessScore(lead) > leadCompletenessScore(bucket.kept)) {
      bucket.discarded.push(bucket.kept);
      bucket.kept = lead;
    } else {
      bucket.discarded.push(lead);
    }
  }

  const kept: RawLead[] = [];
  const discarded: Array<{
    lead: RawLead;
    dedupe_key: string;
    kept_lead_id: string;
    reason: "duplicate_domain";
  }> = [];

  for (const [dedupe_key, bucket] of byKey) {
    kept.push(bucket.kept);
    for (const lead of bucket.discarded) {
      discarded.push({
        lead,
        dedupe_key,
        kept_lead_id: bucket.kept.id,
        reason: "duplicate_domain",
      });
    }
  }

  return { kept, discarded };
}

export function dedupeRawLeads(leads: RawLead[]): RawLead[] {
  return dedupeRawLeadsDetailed(leads).kept;
}

export function rawLeadToScoredLead(
  profile: ProductProfile,
  lead: RawLead,
  config: ScoringConfig,
  preservedStatus?: ScoredLead["status"]
): ScoredLead {
  const { score, score_breakdown, tier } = scoreRawLead(profile, lead, config);

  const scored: ScoredLead = {
    id: lead.id,
    company: {
      name: lead.company.name,
      website: lead.company.website ?? lead.source.url,
      country: lead.company.country,
      description: lead.company.description,
    },
    score,
    score_breakdown,
    tier,
    status: preservedStatus ?? "new",
    dedupe_key: getDedupeKey(lead),
    source_url: lead.source.url,
    match_reason: lead.match_reason,
    contacts: lead.contacts,
    people: [],
    round: lead.round,
    query_id: lead.query_id,
    run_id: lead.run_id,
    discovered_at: lead.discovered_at,
  };

  if (lead.companyIntelligence) {
    scored.companyIntelligence = { ...lead.companyIntelligence };
  }
  return scored;
}

export function buildScoredStats(leads: ScoredLead[]): ScoredLeadsFile["stats"] {
  const by_tier: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const by_status: Record<string, number> = {};

  for (const lead of leads) {
    by_tier[lead.tier] = (by_tier[lead.tier] ?? 0) + 1;
    by_status[lead.status] = (by_status[lead.status] ?? 0) + 1;
  }

  return {
    total: leads.length,
    by_tier,
    by_status,
  };
}

export function sortScoredLeads(leads: ScoredLead[]): ScoredLead[] {
  return [...leads].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.discovered_at ?? "").localeCompare(a.discovered_at ?? "");
  });
}
