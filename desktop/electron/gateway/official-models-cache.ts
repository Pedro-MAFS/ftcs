export type OfficialModelsSource = 'gateway' | 'fallback' | 'none'

export interface OfficialModelOption {
  id: string
  label: string
  rawId: string
  ownedBy?: string
  inputTypes: string[]
  outputTypes: string[]
}

export function findOfficialModelOption(rawId: string): OfficialModelOption | undefined {
  const target = rawId.trim()
  if (!target || !modelsCache) return undefined
  return modelsCache.options.find((option) => option.rawId === target)
}

export interface ModelsCache {
  options: OfficialModelOption[]
  source: OfficialModelsSource
  error?: string
  fetchedAt: number
}

let modelsCache: ModelsCache | null = null

export function getOfficialModelsCache(): ModelsCache | null {
  return modelsCache
}

export function clearOfficialModelsCache(): void {
  modelsCache = null
}

export function setOfficialModelsCache(
  options: OfficialModelOption[],
  source: OfficialModelsSource,
  error?: string,
): void {
  modelsCache = {
    options,
    source,
    error,
    fetchedAt: Date.now(),
  }
}
