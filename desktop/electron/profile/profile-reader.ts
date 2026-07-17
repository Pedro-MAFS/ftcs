import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'

export interface ProductProfileSummary {
  id: string
  status: string
  readinessScore?: number
  companyName?: string
  productName?: string
  missingFields: string[]
  profilePath: string
  updatedAt?: string
}

export interface ProductProfileDetail extends ProductProfileSummary {
  raw: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function summarizeProfile(
  raw: Record<string, unknown>,
  profilePath: string,
): ProductProfileSummary {
  const company = asRecord(raw.company)
  const readiness = asRecord(raw.readiness)
  const products = Array.isArray(raw.products) ? raw.products : []
  const firstProduct = asRecord(products[0])
  const missing = Array.isArray(readiness?.missing_fields)
    ? (readiness!.missing_fields as unknown[]).map(String)
    : []

  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? 'draft'),
    readinessScore:
      typeof readiness?.score === 'number' ? readiness.score : undefined,
    companyName: company?.name ? String(company.name) : undefined,
    productName: firstProduct?.name ? String(firstProduct.name) : undefined,
    missingFields: missing,
    profilePath,
    updatedAt: raw.updated_at ? String(raw.updated_at) : undefined,
  }
}

export function getProfilePath(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, 'data', 'products', productId, 'profile.json')
}

export function loadProfile(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): ProductProfileDetail | null {
  const profilePath = getProfilePath(productId, workspaceRoot)
  if (!fs.existsSync(profilePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<
      string,
      unknown
    >
    return { ...summarizeProfile(raw, profilePath), raw }
  } catch {
    return null
  }
}

export function listProductSummaries(
  workspaceRoot = getWorkspaceRoot(),
): ProductProfileSummary[] {
  const productsDir = path.join(workspaceRoot, 'data', 'products')
  if (!fs.existsSync(productsDir)) return []
  const out: ProductProfileSummary[] = []
  for (const name of fs.readdirSync(productsDir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue
    const profilePath = path.join(productsDir, name, 'profile.json')
    if (!fs.existsSync(profilePath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<
        string,
        unknown
      >
      out.push(summarizeProfile(raw, `data/products/${name}/profile.json`))
    } catch {
      // skip broken
    }
  }
  out.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0
    return tb - ta
  })
  return out
}

export function waitForProfile(
  productId: string,
  options?: {
    workspaceRoot?: string
    timeoutMs?: number
    intervalMs?: number
    signal?: AbortSignal
  },
): Promise<ProductProfileDetail | null> {
  const workspaceRoot = options?.workspaceRoot ?? getWorkspaceRoot()
  const timeoutMs = options?.timeoutMs ?? 15 * 60_000
  const intervalMs = options?.intervalMs ?? 1500
  const started = Date.now()

  return new Promise((resolve) => {
    const tick = () => {
      if (options?.signal?.aborted) {
        resolve(null)
        return
      }
      const profile = loadProfile(productId, workspaceRoot)
      if (profile) {
        resolve(profile)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null)
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}
