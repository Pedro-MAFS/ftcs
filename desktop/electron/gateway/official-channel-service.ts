import path from 'node:path'
import { ensureFreshTokens } from '../auth/oauth-service'
import { readEnvFile, upsertEnvFile, maskSecret } from '../config/env-file'
import { getWorkspaceRoot } from '../config/paths'
import {
  getOfficialModelCatalog,
  getSettingsSnapshot,
  type SettingsSnapshot,
} from '../settings/settings-service'
import { listModels, rotateKey, type GatewayClientError } from './gateway-client'
import {
  FTCS_GATEWAY_KEY_NAME,
  getDefaultTokenGatewayBaseUrl,
  getTokenGatewayBaseUrl,
  getTokenGatewayEnvKey,
} from './gateway-config'
import {
  setOfficialModelsCache,
  type OfficialModelOption,
} from './official-models-cache'

const GATEWAY_KEY_ENV = 'FTCS_GATEWAY_API_KEY'
const CHANNEL_MODE_ENV = 'FTCS_CHANNEL_MODE'

export interface ProvisionOfficialResult {
  ok: boolean
  needLogin?: boolean
  message: string
  action?: string
  settings: SettingsSnapshot
}

export interface RefreshOfficialModelsResult {
  ok: boolean
  message: string
  settings: SettingsSnapshot
}

function getEnvPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.env')
}

function toOfficialOption(rawId: string): OfficialModelOption {
  const id = rawId.includes('/') ? rawId : `deepseek/${rawId}`
  const bare = id.includes('/') ? id.split('/').slice(1).join('/') : id
  return {
    id,
    rawId: bare,
    label: bare,
  }
}

function catalogAsOptions(): OfficialModelOption[] {
  return getOfficialModelCatalog().models.map((m) => toOfficialOption(m.id))
}

function pickModelsAfterFetch(
  rawIds: string[],
  currentModel: string,
  currentSmall: string,
): { model: string; smallModel: string; options: OfficialModelOption[] } {
  const options = rawIds.map((id) => toOfficialOption(id))
  const ids = new Set(options.map((o) => o.id))
  const bareToFull = new Map(options.map((o) => [o.rawId, o.id]))

  function normalize(sel: string, fallback: string): string {
    const t = sel.trim()
    if (ids.has(t)) return t
    const bare = t.includes('/') ? t.split('/').slice(1).join('/') : t
    if (bareToFull.has(bare)) return bareToFull.get(bare)!
    return fallback
  }

  const fallback = options[0]?.id || getOfficialModelCatalog().models[0].id
  const model = normalize(currentModel, fallback)
  const smallFallback =
    options.find((o) => o.rawId.includes('flash'))?.id || options[0]?.id || fallback
  const smallModel = normalize(currentSmall, smallFallback)
  return { model, smallModel, options }
}

/**
 * UC JWT → rotate → 写 sk / baseURL → 拉 models → 校正模型 id
 */
export async function provisionOfficialChannel(input?: {
  reset?: boolean
}): Promise<ProvisionOfficialResult> {
  const reset = Boolean(input?.reset)
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const baseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })

  let bundle = await ensureFreshTokens()
  if (!bundle?.accessToken) {
    return {
      ok: false,
      needLogin: true,
      message: '请先登录后再开通官方通道',
      settings: getSettingsSnapshot(),
    }
  }

  let rotate = await rotateKey({
    accessToken: bundle.accessToken,
    name: FTCS_GATEWAY_KEY_NAME,
    baseUrl,
  })

  if (!rotate.ok && rotate.code === 'need_login') {
    bundle = await ensureFreshTokens({ force: true })
    if (!bundle?.accessToken) {
      return {
        ok: false,
        needLogin: true,
        message: '登录已失效，请重新登录',
        settings: getSettingsSnapshot(),
      }
    }
    rotate = await rotateKey({
      accessToken: bundle.accessToken,
      name: FTCS_GATEWAY_KEY_NAME,
      baseUrl,
    })
  }

  if (!rotate.ok) {
    const err = rotate as GatewayClientError
    return {
      ok: false,
      needLogin: err.code === 'need_login',
      message: err.message,
      settings: getSettingsSnapshot(),
    }
  }

  const envUpdates: Record<string, string> = {
    [CHANNEL_MODE_ENV]: 'official',
    [GATEWAY_KEY_ENV]: rotate.apiKey,
    [getTokenGatewayEnvKey()]: baseUrl || getDefaultTokenGatewayBaseUrl(),
  }

  const current = getSettingsSnapshot()
  const listed = await listModels({ apiKey: rotate.apiKey, baseUrl })
  let message =
    rotate.action === 'rotated' || reset
      ? '网关凭证已更新（旧 Key 已作废）。'
      : '官方通道已开通。'

  if (listed.ok) {
    const picked = pickModelsAfterFetch(
      listed.models.map((m) => m.id),
      current.model,
      current.smallModel,
    )
    envUpdates.FTCS_MODEL = picked.model
    envUpdates.FTCS_SMALL_MODEL = picked.smallModel
    setOfficialModelsCache(picked.options, 'gateway')
  } else {
    const fallback = catalogAsOptions()
    setOfficialModelsCache(fallback, 'fallback', listed.message)
    if (listed.code === 'empty_models') {
      message =
        rotate.action === 'rotated' || reset
          ? `网关凭证已更新（旧 Key 已作废）。${listed.message}`
          : listed.message
    } else {
      message += ` 模型列表未更新：${listed.message}`
    }
  }

  upsertEnvFile(envPath, envUpdates)
  Object.assign(process.env, envUpdates)
  process.env.FTCS_WORKSPACE = workspaceRoot

  return {
    ok: true,
    action: rotate.action,
    message,
    settings: getSettingsSnapshot(),
  }
}

/**
 * 已有 sk 时刷新 GET /models
 */
export async function refreshOfficialModels(): Promise<RefreshOfficialModelsResult> {
  const workspaceRoot = getWorkspaceRoot()
  const envPath = getEnvPath(workspaceRoot)
  const env = readEnvFile(envPath)
  const apiKey = (env[GATEWAY_KEY_ENV] || process.env[GATEWAY_KEY_ENV] || '').trim()
  const baseUrl = getTokenGatewayBaseUrl({ ...process.env, ...env })

  if (!apiKey) {
    setOfficialModelsCache([], 'none', '请先开通官方通道')
    return {
      ok: false,
      message: '请先开通官方通道',
      settings: getSettingsSnapshot(),
    }
  }

  const listed = await listModels({ apiKey, baseUrl })
  if (!listed.ok) {
    const fallback = catalogAsOptions()
    setOfficialModelsCache(fallback, 'fallback', listed.message)
    return {
      ok: false,
      message: listed.message,
      settings: getSettingsSnapshot(),
    }
  }

  const current = getSettingsSnapshot()
  const picked = pickModelsAfterFetch(
    listed.models.map((m) => m.id),
    current.model,
    current.smallModel,
  )
  setOfficialModelsCache(picked.options, 'gateway')

  const envUpdates: Record<string, string> = {
    FTCS_MODEL: picked.model,
    FTCS_SMALL_MODEL: picked.smallModel,
  }
  upsertEnvFile(envPath, envUpdates)
  Object.assign(process.env, envUpdates)

  return {
    ok: true,
    message: `已加载 ${picked.options.length} 个官方模型`,
    settings: getSettingsSnapshot(),
  }
}

export function describeGatewayKeyMask(env?: Record<string, string>): string {
  const key = (
    env?.[GATEWAY_KEY_ENV] ||
    process.env[GATEWAY_KEY_ENV] ||
    ''
  ).trim()
  return key ? maskSecret(key) : ''
}
