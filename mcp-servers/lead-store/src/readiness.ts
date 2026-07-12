import type { ProductProfile, Readiness } from "./profile-types.js";

const DEFAULT_THRESHOLD = 60;

export function computeReadiness(profile: Pick<ProductProfile, "company" | "products" | "buyer_personas" | "target_markets" | "competitors">): Readiness {
  let score = 0;
  const missing_fields: string[] = [];
  const warnings: string[] = [];

  const hasCompanyName = Boolean(profile.company?.name?.trim());
  const hasCompanyWebsite = Boolean(profile.company?.website?.trim());

  if (hasCompanyName && hasCompanyWebsite) {
    score += 20;
  } else {
    if (!hasCompanyName) {
      missing_fields.push("company.name");
    }
    if (!hasCompanyWebsite) {
      missing_fields.push("company.website");
    }
  }

  const hasProductName = profile.products?.some((item) => Boolean(item.name?.trim()));
  if (hasProductName) {
    score += 20;
  } else {
    missing_fields.push("products[].name");
  }

  const hasUseCases = profile.products?.some(
    (item) => Array.isArray(item.use_cases) && item.use_cases.length > 0
  );
  if (hasUseCases) {
    score += 15;
  } else {
    missing_fields.push("products[].use_cases");
  }

  if (profile.buyer_personas && profile.buyer_personas.length > 0) {
    score += 20;
  } else {
    missing_fields.push("buyer_personas");
  }

  if (profile.target_markets?.regions && profile.target_markets.regions.length > 0) {
    score += 15;
  } else {
    missing_fields.push("target_markets.regions");
    warnings.push("未指定目标市场，将默认全球搜索");
  }

  if (profile.competitors && profile.competitors.length > 0) {
    score += 10;
  }

  return {
    score,
    missing_fields,
    warnings,
  };
}

export function resolveStatus(
  readiness: Readiness,
  threshold = DEFAULT_THRESHOLD
): "draft" | "ready" {
  return readiness.score >= threshold ? "ready" : "draft";
}

export function parseReadinessThreshold(configText: string): number {
  const match = configText.match(/profile_readiness_threshold:\s*(\d+)/);
  if (!match) {
    return DEFAULT_THRESHOLD;
  }
  return Number.parseInt(match[1], 10);
}

export function buildFollowUpQuestions(missingFields: string[]): string[] {
  const questions: string[] = [];

  if (missingFields.includes("target_markets.regions")) {
    questions.push("请提供目标市场（如 EU、NA、SEA 或具体国家）。");
  }
  if (missingFields.includes("buyer_personas")) {
    questions.push("请说明目标买家类型（如 distributor、OEM、retailer、engineering_company）。");
  }
  if (missingFields.includes("products[].use_cases")) {
    questions.push("请补充产品主要应用场景（如水处理、石油化工、暖通空调）。");
  }
  if (
    missingFields.includes("company.name") ||
    missingFields.includes("company.website") ||
    missingFields.includes("products[].name")
  ) {
    questions.push("请补充公司名、官网或核心产品名称。");
  }

  return [...new Set(questions)];
}
