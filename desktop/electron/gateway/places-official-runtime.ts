/**
 * 把官方 Places 服务接到现网登录凭证、工作区 .env 和 MCP 注入。
 * 官方 Key 不进入 SettingsSnapshot 的持久字段；查询结果只挂在当次 IPC 返回值上。
 */
import path from 'node:path'
import { ensureFreshTokens } from '../auth/oauth-service'
import { readEnvFile } from '../config/env-file'
import { getWorkspaceRoot } from '../config/paths'
import {
  getPlacesMcpInjection,
  placesMcpInjectionNeedsReload,
  setPlacesMcpInjection,
} from '../opencode/places-mcp-env'
import {
  getSettingsSnapshot,
  type SettingsSnapshot,
} from '../settings/settings-service'
import { createPlacesOfficialKeyClient } from './places-official-key-client'
import { placesOfficialKeyMemory } from './places-official-key-memory'
import {
  createPlacesOfficialService,
  type PlacesOfficialAction,
  type PlacesOfficialView,
  type PlacesRunBegin,
} from './places-official-service'
import { placesSourceForChannel } from '../../src/domain/places-official'

function envPath(): string {
  return path.join(getWorkspaceRoot(), '.env')
}

function readSelection() {
  const env = readEnvFile(envPath())
  const byokKey = (env.GOOGLE_PLACES_API_KEY || '').trim()
  const channelMode = placesSourceForChannel(env.FTCS_CHANNEL_MODE)
  return {
    channelMode,
    byokSet: Boolean(byokKey),
    byokKey,
  }
}

export const placesOfficial = createPlacesOfficialService({
  http: createPlacesOfficialKeyClient(),
  memory: placesOfficialKeyMemory,
  ensureToken: async (options) => {
    const bundle = await ensureFreshTokens(options)
    return bundle?.accessToken ?? null
  },
  readSelection,
  getInjection: getPlacesMcpInjection,
  setInjection: setPlacesMcpInjection,
  injectionNeedsReload: placesMcpInjectionNeedsReload,
})

export interface PlacesOfficialIpcResult {
  ok: boolean
  needLogin: boolean
  message: string
  queried: boolean
  settings: SettingsSnapshot
}

function mergeView(action: PlacesOfficialAction): PlacesOfficialIpcResult {
  const settings = getSettingsSnapshot()
  const view: PlacesOfficialView = action.view
  return {
    ok: action.ok,
    needLogin: action.needLogin,
    message: action.message,
    queried: action.queried,
    settings: {
      ...settings,
      placesKeySource: view.placesKeySource,
      placesOfficialStatus: action.queried ? view.status : null,
      placesOfficialReasonMessage: action.queried ? view.reasonMessage : null,
      placesOfficialExpectedReadyNote: action.queried
        ? view.expectedReadyNote
        : null,
      placesOfficialQueryError: action.queried ? view.queryError : null,
      placesOfficialNeedLogin: action.queried ? view.needLogin : false,
    },
  }
}

export async function applyPlacesOfficialKey(): Promise<PlacesOfficialIpcResult> {
  return mergeView(await placesOfficial.apply())
}

export async function refreshPlacesOfficialKey(): Promise<PlacesOfficialIpcResult> {
  return mergeView(await placesOfficial.refresh())
}

export async function preparePlacesForPreflight(): Promise<{
  ok: boolean
  detail: string
  provider?: 'custom'
}> {
  return placesOfficial.prepareForPreflight()
}

export async function beginPlacesDiscoverRun(runId: string): Promise<PlacesRunBegin> {
  return placesOfficial.beginRun(runId)
}

export function releasePlacesDiscoverRun(): { reload: boolean } {
  return placesOfficial.releaseRun()
}

export async function explainPlacesGoogleRejection(
  googleMessage: string,
): Promise<string> {
  return placesOfficial.handleGoogleRejection(googleMessage)
}
