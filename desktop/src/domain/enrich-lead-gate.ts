import { OFFICIAL_ENRICH_BLOCKED } from './hunter-channel-copy'

/**
 * 线索页「补全联系人」可用条件与按钮提示。
 * 官方看通道凭证；自定义仍看自备 Key。
 */

export interface EnrichCredentialInput {
  channelMode: string
  officialProvisioned: boolean
  hunterKeySet: boolean
}

export interface EnrichLeadGateInput extends EnrichCredentialInput {
  phase: string
  hasDomain: boolean
}

export interface EnrichLeadTitleInput extends EnrichLeadGateInput {
  busy: boolean
  verifyEmails: boolean
}

export const OFFICIAL_ENRICH_TITLE = '补全联系人，费用从官方通道余额扣除'
export const OFFICIAL_ENRICH_VERIFY_TITLE =
  '补全联系人并验证邮箱，费用从官方通道余额扣除'
export const CUSTOM_HUNTER_KEY_TITLE = '请先在设置 → 集成中配置 Hunter API Key'
export const CUSTOM_HUNTER_BATCH_TITLE = '请先在设置 → 集成配置 Hunter API Key'
export const CUSTOM_HUNTER_BANNER = '补全联系人需 Hunter Key（设置 → 集成）'

export function enrichCredentialReady(input: EnrichCredentialInput): boolean {
  if (input.channelMode === 'official') return input.officialProvisioned
  return input.hunterKeySet
}

export function enrichBannerText(input: EnrichCredentialInput): string {
  if (input.channelMode === 'official') {
    return input.officialProvisioned ? '' : OFFICIAL_ENRICH_BLOCKED
  }
  return input.hunterKeySet ? '' : CUSTOM_HUNTER_BANNER
}

export function enrichBlockedTitle(input: EnrichCredentialInput): string {
  if (input.channelMode === 'official') return OFFICIAL_ENRICH_BLOCKED
  return CUSTOM_HUNTER_BATCH_TITLE
}

export function enrichNotReadyMessage(input: EnrichCredentialInput): string {
  if (input.channelMode === 'official') return OFFICIAL_ENRICH_BLOCKED
  return CUSTOM_HUNTER_KEY_TITLE
}

export function canEnrichLeadGate(input: EnrichLeadGateInput): boolean {
  return input.phase === 'scored' && input.hasDomain && enrichCredentialReady(input)
}

export function enrichLeadTitle(input: EnrichLeadTitleInput): string {
  if (input.busy) return '已有任务在运行'
  if (input.phase !== 'scored') return '仅已评分线索可补全联系人'
  if (!input.hasDomain) return '请先填写有效官网域名'
  if (input.channelMode === 'official') {
    if (!input.officialProvisioned) return OFFICIAL_ENRICH_BLOCKED
    return input.verifyEmails ? OFFICIAL_ENRICH_VERIFY_TITLE : OFFICIAL_ENRICH_TITLE
  }
  if (!input.hunterKeySet) return CUSTOM_HUNTER_KEY_TITLE
  return input.verifyEmails
    ? '补全联系人并验证邮箱（约 0.5 credit/封）'
    : '补全联系人（Domain Search，约 1 credit）'
}
