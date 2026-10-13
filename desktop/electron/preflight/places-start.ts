import type { SettingsSnapshot } from '../settings/settings-service'
import {
  BYOK_PLACES_DETAIL,
  OFFICIAL_PLACES_DETAIL,
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
    placesKeySource?: string | null
    officialFetch?: PlacesOfficialFetchOutcome | null
  },
): PlacesStartResolution {
  const plan = planPlacesRun({
    savedSource: settings.placesKeySource,
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
    detail: '请在设置 → 探索申请官方 Places Key，或填写自备 Key（仅 R3 需要）。',
  }
}
