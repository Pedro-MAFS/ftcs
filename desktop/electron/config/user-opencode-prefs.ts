import type { Config } from '@opencode-ai/sdk/v2'
import { getTokenGatewayBaseUrl } from '../gateway/gateway-config'

const CUSTOM_ENV_KEY = 'FTCS_CUSTOM_API_KEY'
const GATEWAY_KEY_ENV = 'FTCS_GATEWAY_API_KEY'
const CHANNEL_MODE_ENV = 'FTCS_CHANNEL_MODE'

/**
 * 将用户偏好（.env）叠加到托管模板 opencode.json 上。
 * 仅官方 / 自定义两档；官方未开通时不回落自备 DeepSeek Key。
 */
export function applyUserPrefsToOpenCodeConfig(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const next = { ...config } as Config & Record<string, unknown>
  const model = (env.FTCS_MODEL || '').trim()
  const smallModel = (env.FTCS_SMALL_MODEL || '').trim()
  const channelMode = (env[CHANNEL_MODE_ENV] || 'official').trim()
  const baseUrl = (env.FTCS_MODEL_BASE_URL || '').trim()
  const gatewayKey = (env[GATEWAY_KEY_ENV] || '').trim()
  const customKey = (env[CUSTOM_ENV_KEY] || env.OPENAI_API_KEY || '').trim()

  if (model) next.model = model
  if (smallModel) next.small_model = smallModel

  const providers =
    next.provider && typeof next.provider === 'object'
      ? { ...(next.provider as Record<string, unknown>) }
      : {}

  if (channelMode === 'official') {
    if (!gatewayKey || !model) {
      // 未开通：不叠任何上游 provider，避免误用 DEEPSEEK_API_KEY
      return next
    }
    const modelId = model.includes('/') ? model.split('/').slice(1).join('/') : model
    const smallId = smallModel.includes('/')
      ? smallModel.split('/').slice(1).join('/')
      : smallModel || modelId
    const gatewayBase = getTokenGatewayBaseUrl(env)
    providers['ftcs-gateway'] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'FTCS Official',
      options: {
        baseURL: gatewayBase,
        apiKey: `{env:${GATEWAY_KEY_ENV}}`,
      },
      models: {
        [modelId]: { name: modelId },
        ...(smallId !== modelId ? { [smallId]: { name: smallId } } : {}),
      },
    }
    // OpenCode model id 需带 provider 前缀
    if (model && !model.startsWith('ftcs-gateway/')) {
      next.model = `ftcs-gateway/${modelId}`
    }
    if (smallModel) {
      const sid = smallModel.includes('/')
        ? smallModel.split('/').slice(1).join('/')
        : smallModel
      next.small_model = `ftcs-gateway/${sid}`
    }
    next.provider = providers as Config['provider']
    return next
  }

  // custom
  if (model) {
    const modelId = model.includes('/') ? model.split('/').slice(1).join('/') : model
    const smallId = smallModel.includes('/')
      ? smallModel.split('/').slice(1).join('/')
      : smallModel || modelId

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
    if (customKey) {
      // ensure env alias for adapters that read OPENAI_API_KEY
    }
  }

  return next
}
