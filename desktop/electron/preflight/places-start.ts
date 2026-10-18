import type { SettingsSnapshot } from '../settings/settings-service'
import {
  BYOK_PLACES_DETAIL,
  CUSTOM_PLACES_MISSING_MESSAGE,
  NO_PLACES_KEY_MESSAGE,
  OFFICIAL_PLACES_DETAIL,
  placesSourceForChannel,
  planPlacesRun,
  type OfficialKeyFailureDetail,
} from '../../src/domain/places-official'

export type PlacesStartProvider = 'custom' | 'gateway'

export interface PlacesStartResolution {
  ok: boolean
  detail: string
  provider?: PlacesStartProvider
}

export interface PlacesOfficialFetchOutcome {
  ok: boolean
  detail: string
  needLogin?: boolean
  failure?: OfficialKeyFailureDetail
}

/** US-E-10 代调不实现。官方 Key 已开通也不把这里改成 true。 */
export function isPlacesGatewayReady(
  _settings: Pick<
    SettingsSnapshot,
    'channelMode' | 'officialProvisioned' | 'placesProvider'
  >,
): boolean {
  return false
}

/**
 * R3 启动前的同步判定。来源需要官方 Key 时，调用方先取 Key，
 * 再把结果放进 officialFetch。没有 officialFetch 则视为还不能开跑。
 */
export function resolvePlacesStart(
  settings: Pick<
    SettingsSnapshot,
    'channelMode' | 'placesApiKeySet' | 'placesProvider' | 'officialProvisioned'
  > & {
    officialFetch?: PlacesOfficialFetchOutcome | null
  },
): PlacesStartResolution {
  const plan = planPlacesRun({
    channelMode: settings.channelMode,
    byokSet: settings.placesApiKeySet,
  })
  if (plan.action === 'use-byok') {
    return {
      ok: true,
      provider: 'custom',
      detail: BYOK_PLACES_DETAIL,
    }
  }
  if (plan.action === 'fail') {
    return { ok: false, detail: plan.detail }
  }
  if (settings.officialFetch?.ok) {
    return {
      ok: true,
      provider: 'custom',
      detail: settings.officialFetch.detail || OFFICIAL_PLACES_DETAIL,
    }
  }
  if (settings.officialFetch && !settings.officialFetch.ok) {
    return { ok: false, detail: settings.officialFetch.detail }
  }
  return {
    ok: false,
    detail:
      placesSourceForChannel(settings.channelMode) === 'custom'
        ? CUSTOM_PLACES_MISSING_MESSAGE
        : NO_PLACES_KEY_MESSAGE,
  }
}
