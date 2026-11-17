import type { SettingsSnapshot } from '../settings/settings-service'
import {
  CUSTOM_HUNTER_MISSING,
  CUSTOM_HUNTER_PREFLIGHT_LABEL,
  CUSTOM_HUNTER_READY,
  OFFICIAL_ENRICH_BLOCKED,
  OFFICIAL_HUNTER_PREFLIGHT_LABEL,
  OFFICIAL_HUNTER_PREFLIGHT_READY,
} from '../../src/domain/hunter-channel-copy'

export interface HunterStartResolution {
  ok: boolean
  detail: string
}

export function hunterPreflightLabel(channelMode: string | undefined): string {
  return channelMode === 'official'
    ? OFFICIAL_HUNTER_PREFLIGHT_LABEL
    : CUSTOM_HUNTER_PREFLIGHT_LABEL
}

/** enrich-lead-contacts 启动前：官方看凭证，自定义看自备 Key。 */
export function resolveHunterStart(
  settings: Pick<SettingsSnapshot, 'hunterApiKeySet'> & {
    channelMode?: SettingsSnapshot['channelMode']
    officialProvisioned?: boolean
  },
): HunterStartResolution {
  if (settings.channelMode === 'official') {
    if (settings.officialProvisioned) {
      return { ok: true, detail: OFFICIAL_HUNTER_PREFLIGHT_READY }
    }
    return { ok: false, detail: OFFICIAL_ENRICH_BLOCKED }
  }
  if (settings.hunterApiKeySet) {
    return { ok: true, detail: CUSTOM_HUNTER_READY }
  }
  return { ok: false, detail: CUSTOM_HUNTER_MISSING }
}
