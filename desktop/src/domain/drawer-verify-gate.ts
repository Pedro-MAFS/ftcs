import { OFFICIAL_ENRICH_BLOCKED } from './hunter-channel-copy'

/** 抽屉「验证」是否可点。官方看凭证，自定义看自备 Key。不看验邮开关。 */
export const OFFICIAL_DRAWER_BLOCKED = OFFICIAL_ENRICH_BLOCKED

export const CUSTOM_DRAWER_BLOCKED = '请先在设置 → 集成配置 Hunter API Key'

export interface DrawerVerifyGateInput {
  channelMode: string
  officialProvisioned: boolean
  hunterKeySet: boolean
}

export function drawerVerifyReady(input: DrawerVerifyGateInput): boolean {
  if (input.channelMode === 'official') return input.officialProvisioned
  return input.hunterKeySet
}

export function drawerVerifyBlockedMessage(input: DrawerVerifyGateInput): string {
  if (input.channelMode === 'official') return OFFICIAL_DRAWER_BLOCKED
  return CUSTOM_DRAWER_BLOCKED
}
