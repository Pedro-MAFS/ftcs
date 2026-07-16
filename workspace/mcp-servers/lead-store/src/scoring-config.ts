import { readFileSync, existsSync } from "node:fs";
import { getConfigPath } from "./paths.js";

export interface ScoringWeights {
  product_match: number;
  purchase_intent: number;
  size_fit: number;
  geo_match: number;
  reachability: number;
  competition: number;
}

export interface ScoringTiers {
  high: number;
  medium: number;
  low: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  tiers: ScoringTiers;
}

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    product_match: 0.3,
    purchase_intent: 0.25,
    size_fit: 0.15,
    geo_match: 0.15,
    reachability: 0.1,
    competition: 0.05,
  },
  tiers: {
    high: 80,
    medium: 60,
    low: 40,
  },
};

function parseNumberMap(text: string, section: "weights" | "tiers"): Record<string, number> {
  const lines = text.split("\n");
  const result: Record<string, number> = {};
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === `${section}:`) {
      inSection = true;
      continue;
    }
    if (inSection && trimmed.endsWith(":") && !trimmed.includes(" ")) {
      break;
    }
    if (!inSection || !trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([a-z_]+):\s*([0-9.]+)/);
    if (match) {
      result[match[1]] = Number.parseFloat(match[2]);
    }
  }

  return result;
}

export function loadScoringConfig(root: string): ScoringConfig {
  const configPath = getConfigPath(root);
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const text = readFileSync(configPath, "utf8");
  const weightsMap = parseNumberMap(text, "weights");
  const tiersMap = parseNumberMap(text, "tiers");

  return {
    weights: {
      product_match: weightsMap.product_match ?? DEFAULT_CONFIG.weights.product_match,
      purchase_intent: weightsMap.purchase_intent ?? DEFAULT_CONFIG.weights.purchase_intent,
      size_fit: weightsMap.size_fit ?? DEFAULT_CONFIG.weights.size_fit,
      geo_match: weightsMap.geo_match ?? DEFAULT_CONFIG.weights.geo_match,
      reachability: weightsMap.reachability ?? DEFAULT_CONFIG.weights.reachability,
      competition: weightsMap.competition ?? DEFAULT_CONFIG.weights.competition,
    },
    tiers: {
      high: tiersMap.high ?? DEFAULT_CONFIG.tiers.high,
      medium: tiersMap.medium ?? DEFAULT_CONFIG.tiers.medium,
      low: tiersMap.low ?? DEFAULT_CONFIG.tiers.low,
    },
  };
}

export function resolveTier(
  score: number,
  tiers: ScoringTiers
): "high" | "medium" | "low" {
  if (score >= tiers.high) {
    return "high";
  }
  if (score >= tiers.medium) {
    return "medium";
  }
  return "low";
}

export function weightedScore(
  breakdown: Record<keyof ScoringWeights, number>,
  weights: ScoringWeights
): number {
  const score =
    breakdown.product_match * weights.product_match +
    breakdown.purchase_intent * weights.purchase_intent +
    breakdown.size_fit * weights.size_fit +
    breakdown.geo_match * weights.geo_match +
    breakdown.reachability * weights.reachability +
    breakdown.competition * weights.competition;

  return Math.round(score);
}
