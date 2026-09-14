import type { SettingsSnapshot } from '../settings/settings-service'

export interface HunterStartResolution {
  ok: boolean
  detail: string
}

/** enrich-lead-contacts 启动前 Hunter 通道判定（US-C-03）。无官方代调分支。 */
export function resolveHunterStart(
  settings: Pick<SettingsSnapshot, 'hunterApiKeySet'>,
): HunterStartResolution {
  if (settings.hunterApiKeySet) {
    return { ok: true, detail: 'Hunter API Key 已配置（BYOK）' }
  }
  return {
    ok: false,
    detail:
      '请先在设置 → 集成中配置 Hunter API Key（补全联系人需要；不影响探索/开发信）',
  }
}
