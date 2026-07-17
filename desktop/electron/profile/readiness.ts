/** 与 lead-store readiness 规则保持一致（阈值默认 60） */

export interface ReadinessResult {
  score: number
  missing_fields: string[]
  warnings: string[]
}

type ProfileSlice = {
  company?: {
    name?: string
    website?: string
  }
  products?: Array<{
    name?: string
    use_cases?: string[]
  }>
  buyer_personas?: unknown[]
  target_markets?: {
    regions?: string[]
  }
  competitors?: unknown[]
}

const DEFAULT_THRESHOLD = 60

export function computeReadiness(profile: ProfileSlice): ReadinessResult {
  let score = 0
  const missing_fields: string[] = []
  const warnings: string[] = []

  const hasCompanyName = Boolean(profile.company?.name?.trim())
  const hasCompanyWebsite = Boolean(profile.company?.website?.trim())

  if (hasCompanyName && hasCompanyWebsite) {
    score += 20
  } else {
    if (!hasCompanyName) missing_fields.push('company.name')
    if (!hasCompanyWebsite) missing_fields.push('company.website')
  }

  const hasProductName = profile.products?.some((item) => Boolean(item.name?.trim()))
  if (hasProductName) {
    score += 20
  } else {
    missing_fields.push('products[].name')
  }

  const hasUseCases = profile.products?.some(
    (item) => Array.isArray(item.use_cases) && item.use_cases.length > 0,
  )
  if (hasUseCases) {
    score += 15
  } else {
    missing_fields.push('products[].use_cases')
  }

  if (profile.buyer_personas && profile.buyer_personas.length > 0) {
    score += 20
  } else {
    missing_fields.push('buyer_personas')
  }

  if (profile.target_markets?.regions && profile.target_markets.regions.length > 0) {
    score += 15
  } else {
    missing_fields.push('target_markets.regions')
    warnings.push('未指定目标市场，将默认全球搜索')
  }

  if (profile.competitors && profile.competitors.length > 0) {
    score += 10
  }

  return { score, missing_fields, warnings }
}

export function resolveStatus(
  readiness: ReadinessResult,
  threshold = DEFAULT_THRESHOLD,
): 'draft' | 'ready' {
  return readiness.score >= threshold ? 'ready' : 'draft'
}
