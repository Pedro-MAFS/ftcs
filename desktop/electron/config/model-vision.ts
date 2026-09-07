export const CUSTOM_VISION_ENV = 'FTCS_CUSTOM_MODEL_SUPPORTS_IMAGE'

const GATEWAY_TYPE_TO_MODALITY: Record<string, string> = {
  txt: 'text',
  text: 'text',
  image: 'image',
}

export type OpenCodeModelConfig = {
  name: string
  modalities?: {
    input: string[]
    output: string[]
  }
}

/** 去掉 `deepseek/`、`ftcs-gateway/` 等前缀，便于与网关 raw id 比对 */
export function normalizeModelRawId(modelId: string): string {
  const trimmed = modelId.trim()
  if (!trimmed) return ''
  const slash = trimmed.indexOf('/')
  if (slash >= 0) return trimmed.slice(slash + 1)
  return trimmed
}

export function mapGatewayTypesToModalities(
  inputTypes?: string[],
  outputTypes?: string[],
): { input: string[]; output: string[] } | undefined {
  const mapTypes = (values?: string[]) =>
    (values || [])
      .map((value) => GATEWAY_TYPE_TO_MODALITY[value.trim().toLowerCase()] ?? value.trim())
      .filter(Boolean)

  const input = mapTypes(inputTypes)
  const output = mapTypes(outputTypes)
  if (input.length === 0 && output.length === 0) return undefined
  return {
    input: input.length > 0 ? input : ['text'],
    output: output.length > 0 ? output : ['text'],
  }
}

export function gatewayModelSupportsImage(inputTypes?: string[]): boolean {
  return (inputTypes || []).some((value) => value.trim().toLowerCase() === 'image')
}

export function parseEnvBool(raw: string | undefined): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function formatEnvBool(value: boolean): string {
  return value ? 'true' : 'false'
}

/** 自定义通道：勾选后写入 OpenCode modalities 以支持 Read 图片 */
export function buildOpenCodeModelConfig(
  name: string,
  supportsImageInput: boolean,
): OpenCodeModelConfig {
  const entry: OpenCodeModelConfig = { name }
  if (supportsImageInput) {
    entry.modalities = {
      input: ['text', 'image'],
      output: ['text'],
    }
  }
  return entry
}

/** 官方通道：按网关 /models 返回的 input_types / output_types 生成 OpenCode 模型配置 */
export function buildOpenCodeModelConfigFromGateway(
  name: string,
  inputTypes?: string[],
  outputTypes?: string[],
): OpenCodeModelConfig {
  const entry: OpenCodeModelConfig = { name }
  if (!gatewayModelSupportsImage(inputTypes)) return entry
  const modalities = mapGatewayTypesToModalities(inputTypes, outputTypes)
  if (modalities) entry.modalities = modalities
  return entry
}
