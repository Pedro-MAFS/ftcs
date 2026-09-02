import type { SettingsSnapshot } from '../settings/settings-service'

export type PlacesStartProvider = 'custom' | 'gateway'

export interface PlacesStartResolution {
  ok: boolean
  detail: string
  provider?: PlacesStartProvider
}

/** E-10 落地后查网关 Places 健康与余额；E-09 恒 false。 */
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
        '官方地图通道尚未就绪。请先在设置 → 探索填写 Google Places API Key，或等待平台开通官方地图代调。',
    }
  }
  return {
    ok: false,
    detail: '请先在设置 → 探索中配置 Google Places API Key（仅 R3 需要）',
  }
}
