import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { generateProductId } from './product-id'
import { getProfilePath, loadProfile, type ProductProfileDetail } from './profile-reader'
import { computeReadiness, resolveStatus } from './readiness'
import { mergeSourceInputs, type SourcesManifest } from './profile-sources'

export interface ProfileProductEdit {
  name?: string
  name_en?: string
  category?: string
  materials?: string[]
  specs?: string[]
  moq?: string
  price_range?: string
  use_cases?: string[]
  differentiators?: string[]
}

export interface ProfileSaveInput {
  productId: string
  company: {
    name?: string
    website?: string
    country?: string
    description?: string
    certifications?: string[]
  }
  products: ProfileProductEdit[]
  buyer_personas: Array<{
    role?: string
    company_types?: string[]
    regions?: string[]
    pain_points?: string[]
  }>
  target_markets: {
    regions?: string[]
    excluded_regions?: string[]
    languages?: string[]
  }
}

export interface ProfileSaveResult {
  ok: boolean
  message: string
  profile?: ProductProfileDetail
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

/** 新建一条空草稿画像，供用户手工填写 */
export function createEmptyDraftProfile(
  workspaceRoot = getWorkspaceRoot(),
): ProfileSaveResult {
  const productId = generateProductId(workspaceRoot)
  const now = new Date().toISOString()

  const company = {
    name: '',
    website: '',
    country: '',
    description: '',
    certifications: [] as string[],
  }
  const products = [
    {
      name: '',
      name_en: '',
      category: '',
      materials: [] as string[],
      specs: [] as string[],
      moq: '',
      price_range: '',
      use_cases: [] as string[],
      differentiators: [] as string[],
    },
  ]
  const buyer_personas: unknown[] = []
  const target_markets = {
    regions: [] as string[],
    excluded_regions: [] as string[],
    languages: [] as string[],
  }
  const competitors: unknown[] = []

  const readiness = computeReadiness({
    company,
    products,
    buyer_personas,
    target_markets,
    competitors,
  })
  const status = resolveStatus(readiness)

  const profile: Record<string, unknown> = {
    id: productId,
    version: 1,
    created_at: now,
    updated_at: now,
    status,
    readiness,
    company,
    products,
    buyer_personas,
    target_markets,
    competitors,
    source_inputs: [
      {
        type: 'manual',
        note: '手工创建草稿',
        created_at: now,
      },
    ],
  }

  const profilePath = getProfilePath(productId, workspaceRoot)
  fs.mkdirSync(path.dirname(profilePath), { recursive: true })
  fs.mkdirSync(path.join(path.dirname(profilePath), 'inputs'), {
    recursive: true,
  })
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')

  const loaded = loadProfile(productId, workspaceRoot)
  if (!loaded) {
    return { ok: false, message: '草稿已写入但重新读取失败' }
  }

  return {
    ok: true,
    message: `已创建草稿 ${productId}`,
    profile: loaded,
  }
}

export function saveProductProfile(
  input: ProfileSaveInput,
  workspaceRoot = getWorkspaceRoot(),
): ProfileSaveResult {
  const productId = cleanString(input.productId)
  if (!productId) {
    return { ok: false, message: '缺少产品 ID' }
  }

  const existing = loadProfile(productId, workspaceRoot)
  if (!existing) {
    return { ok: false, message: `未找到画像：${productId}` }
  }

  const raw = { ...existing.raw }
  const now = new Date().toISOString()

  const company = {
    ...asRecord(raw.company),
    name: cleanString(input.company?.name),
    website: cleanString(input.company?.website),
    country: cleanString(input.company?.country),
    description: cleanString(input.company?.description),
    certifications: cleanStringList(input.company?.certifications),
  }

  const products = (input.products ?? []).map((item) => ({
    name: cleanString(item.name),
    name_en: cleanString(item.name_en),
    category: cleanString(item.category),
    materials: cleanStringList(item.materials),
    specs: cleanStringList(item.specs),
    moq: cleanString(item.moq),
    price_range: cleanString(item.price_range),
    use_cases: cleanStringList(item.use_cases),
    differentiators: cleanStringList(item.differentiators),
  }))

  const existingMarkets = asRecord(raw.target_markets) ?? {}
  const target_markets = {
    ...existingMarkets,
    regions: cleanStringList(input.target_markets?.regions),
    excluded_regions: cleanStringList(
      input.target_markets?.excluded_regions ?? existingMarkets.excluded_regions,
    ),
    languages: cleanStringList(
      input.target_markets?.languages ?? existingMarkets.languages,
    ),
  }

  const buyer_personas = (input.buyer_personas ?? [])
    .map((item) => ({
      role: cleanString(item.role),
      company_types: cleanStringList(item.company_types),
      regions: cleanStringList(item.regions),
      pain_points: cleanStringList(item.pain_points),
    }))
    .filter(
      (item) =>
        item.role ||
        item.company_types.length > 0 ||
        item.regions.length > 0 ||
        item.pain_points.length > 0,
    )

  const competitors = Array.isArray(raw.competitors) ? raw.competitors : []

  const readiness = computeReadiness({
    company,
    products,
    buyer_personas,
    target_markets,
    competitors,
  })
  const status = resolveStatus(readiness)

  const next: Record<string, unknown> = {
    ...raw,
    id: productId,
    version: typeof raw.version === 'number' ? raw.version : 1,
    created_at: raw.created_at ?? now,
    updated_at: now,
    status,
    readiness,
    company,
    products,
    buyer_personas,
    target_markets,
    competitors,
    source_inputs: Array.isArray(raw.source_inputs) ? raw.source_inputs : [],
  }

  const profilePath = getProfilePath(productId, workspaceRoot)
  fs.mkdirSync(path.dirname(profilePath), { recursive: true })
  fs.writeFileSync(profilePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')

  const profile = loadProfile(productId, workspaceRoot)
  if (!profile) {
    return { ok: false, message: '写入成功但重新读取失败' }
  }

  return {
    ok: true,
    message: `已保存 ${productId} · ${status} · 就绪度 ${readiness.score}`,
    profile,
  }
}

/** 逻辑删除：仅将 status 标为 deleted，不删除目录与文件 */
export function softDeleteProductProfile(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): ProfileSaveResult {
  const id = cleanString(productId)
  if (!id) {
    return { ok: false, message: '缺少产品 ID' }
  }

  const existing = loadProfile(id, workspaceRoot)
  if (!existing) {
    return { ok: false, message: `未找到画像：${id}` }
  }

  if (existing.status === 'deleted' || existing.status === 'archived') {
    return { ok: true, message: `${id} 已是删除状态`, profile: existing }
  }

  const now = new Date().toISOString()
  const next: Record<string, unknown> = {
    ...existing.raw,
    id,
    status: 'deleted',
    updated_at: now,
    deleted_at: now,
  }

  const profilePath = getProfilePath(id, workspaceRoot)
  fs.mkdirSync(path.dirname(profilePath), { recursive: true })
  fs.writeFileSync(profilePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')

  const profile = loadProfile(id, workspaceRoot)
  return {
    ok: true,
    message: `已删除「${id}」`,
    profile: profile ?? undefined,
  }
}

/** Agent 抽完后用 inputs/_sources.json 补齐 source_inputs，不改业务字段。 */
export function patchProfileSourceInputs(
  productId: string,
  workspaceRoot = getWorkspaceRoot(),
): ProductProfileDetail | null {
  const profile = loadProfile(productId, workspaceRoot)
  if (!profile) return null

  const sourcesPath = path.join(
    workspaceRoot,
    'data',
    'products',
    productId,
    'inputs',
    '_sources.json',
  )
  if (!fs.existsSync(sourcesPath)) return profile

  let manifest: unknown
  try {
    manifest = JSON.parse(fs.readFileSync(sourcesPath, 'utf8')) as unknown
  } catch {
    return profile
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return profile

  const merged = mergeSourceInputs(profile.raw.source_inputs, manifest as SourcesManifest)
  const next = { ...profile.raw, source_inputs: merged }
  fs.writeFileSync(getProfilePath(productId, workspaceRoot), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return loadProfile(productId, workspaceRoot) ?? profile
}

