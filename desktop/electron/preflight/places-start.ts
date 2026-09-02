import type { SettingsSnapshot } from '../settings/settings-service'

export type PlacesStartProvider = 'custom' | 'gateway'

export interface PlacesStartResolution {
  ok: boolean
  detail: string
  provider?: PlacesStartProvider
}

/** US-E-10 无限期延后：官方 Places 网关不实现，恒 false。 */
export function isPlacesGatewayReady(
  _settings: Pick<
    SettingsSnapshot,
    'channelMode' | 'officialProvisioned' | 'placesProvider'
  >,
): boolean {
  return false
}

/** R3 启动前 Places 通道判定（Preflight 与详设 §2 决策表一致）。 */
export function resolvePlacesStart(
  settings: Pick<
    SettingsSnapshot,
    | 'channelMode'
    | 'placesApiKeySet'
    | 'placesProvider'
    | 'officialProvisioned'
  >,
): PlacesStartResolution {
  if (settings.placesApiKeySet) {
    return {
      ok: true,
      provider: 'custom',
      detail: 'Google Places API Key 已配置（直连）',
    }
  }
  if (
    settings.channelMode === 'official' &&
    settings.placesProvider === 'gateway' &&
    isPlacesGatewayReady(settings)
  ) {
    return {
      ok: true,
      provider: 'gateway',
      detail: '官方通道 · Places 网关可用',
    }
  }
  if (settings.channelMode === 'official') {
    return {
      ok: false,
      detail:
        'R3 需自备 Google Places API Key（设置 → 探索）。官方通道不提供 Places 代调，Places 请用 BYOK 直连 Google。',
    }
  }
  return {
    ok: false,
    detail: '请先在设置 → 探索中配置 Google Places API Key（仅 R3 需要）',
  }
}
