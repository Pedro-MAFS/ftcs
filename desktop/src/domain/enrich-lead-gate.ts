/**
 * 线索页「补全联系人」可用条件与按钮提示（US-HC-01）。
 * 未开通官方通道时的禁用文案仍是现网句子，预检与设置布局归 US-HC-06。
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

export function enrichCredentialReady(input: EnrichCredentialInput): boolean {
  if (input.channelMode === 'official' && input.officialProvisioned) return true
  return input.hunterKeySet
}

export function canEnrichLeadGate(input: EnrichLeadGateInput): boolean {
  return input.phase === 'scored' && input.hasDomain && enrichCredentialReady(input)
}

export function enrichLeadTitle(input: EnrichLeadTitleInput): string {
  if (input.busy) return '已有任务在运行'
  if (input.phase !== 'scored') return '仅已评分线索可补全联系人'
  if (!input.hasDomain) return '请先填写有效官网域名'
  if (input.channelMode === 'official' && input.officialProvisioned) {
    return input.verifyEmails ? OFFICIAL_ENRICH_VERIFY_TITLE : OFFICIAL_ENRICH_TITLE
  }
  if (!input.hunterKeySet) return '请先在设置 → 集成中配置 Hunter API Key'
  return input.verifyEmails
    ? '补全联系人并验证邮箱（约 0.5 credit/封）'
    : '补全联系人（Domain Search，约 1 credit）'
}
