import type { Config } from '@opencode-ai/sdk/v2'

const CUSTOM_ENV_KEY = 'FTCS_CUSTOM_API_KEY'

/**
 * 将用户偏好（.env）叠加到托管模板 opencode.json 上。
 * 模板只负责 skills / mcp / 默认值；model / 自定义 provider 以 .env 为准。
 */
export function applyUserPrefsToOpenCodeConfig(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const next = { ...config } as Config & Record<string, unknown>
  const model = (env.FTCS_MODEL || '').trim()
  const smallModel = (env.FTCS_SMALL_MODEL || '').trim()
  const providerId = (env.FTCS_PROVIDER_ID || '').trim()
  const baseUrl = (env.FTCS_MODEL_BASE_URL || '').trim()

  if (model) next.model = model
  if (smallModel) next.small_model = smallModel

  if (providerId === 'custom' && model) {
    const modelId = model.includes('/') ? model.split('/').slice(1).join('/') : model
    const smallId = smallModel.includes('/')
      ? smallModel.split('/').slice(1).join('/')
      : smallModel || modelId

    const providers =
      (next.provider as Record<string, unknown> | undefined)
        ? { ...(next.provider as Record<string, unknown>) }
        : {}

    providers.custom = {
      npm: '@ai-sdk/openai-compatible',
      name: 'Custom Compatible',
      options: {
        baseURL: baseUrl || 'http://127.0.0.1:11434/v1',
        apiKey: `{env:${CUSTOM_ENV_KEY}}`,
      },
      models: {
        [modelId]: { name: modelId },
        ...(smallId !== modelId ? { [smallId]: { name: smallId } } : {}),
      },
    }
    next.provider = providers as Config['provider']
  }

  return next
}
