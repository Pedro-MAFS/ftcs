/** 官方通道：支持 Read 多模态的模型 rawId 白名单（与网关 models 列表 id 对齐，不含 provider 前缀） */
export const OFFICIAL_VISION_MODEL_RAW_IDS = ['deepseek-v4-flash-vision-exp'] as const

export const CUSTOM_VISION_ENV = 'FTCS_CUSTOM_MODEL_SUPPORTS_IMAGE'

export const VISION_MODALITIES = {
  input: ['text', 'image'] as const,
  output: ['text'] as const,
}

export type OpenCodeModelConfig = {
  name: string
  modalities?: {
    input: string[]
    output: string[]
  }
}

/** 去掉 `deepseek/`、`ftcs-gateway/` 等前缀，便于与白名单比对 */
export function normalizeModelRawId(modelId: string): string {
  const trimmed = modelId.trim()
  if (!trimmed) return ''
  const slash = trimmed.indexOf('/')
  if (slash >= 0) return trimmed.slice(slash + 1)
  return trimmed
}

export function isOfficialVisionModel(modelId: string): boolean {
  const raw = normalizeModelRawId(modelId)
  return (OFFICIAL_VISION_MODEL_RAW_IDS as readonly string[]).includes(raw)
}

export function parseEnvBool(raw: string | undefined): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function formatEnvBool(value: boolean): string {
  return value ? 'true' : 'false'
}

/** OpenCode 自定义 provider 需显式声明 modalities，否则 Read 图片会在客户端被拦 */
export function buildOpenCodeModelConfig(
  name: string,
  supportsImageInput: boolean,
): OpenCodeModelConfig {
  const entry: OpenCodeModelConfig = { name }
  if (supportsImageInput) {
    entry.modalities = {
      input: [...VISION_MODALITIES.input],
      output: [...VISION_MODALITIES.output],
    }
  }
  return entry
}
