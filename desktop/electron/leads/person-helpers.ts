/** US-C-04：与 lead-store C7 / §6.3 对齐的桌面侧纯函数 */

const GENERIC_PREFIXES = new Set([
  'info',
  'sales',
  'support',
  'contact',
  'hello',
  'mail',
  'admin',
  'office',
  'service',
  'help',
  'enquiry',
  'inquiry',
  'customerservice',
  'techsupport',
  'webmaster',
  'accountsreceivable',
])

export const SYNC_CONFIDENCE_MIN = 70

export function isPersonalEmail(email: string): boolean {
  const prefix = email.split('@')[0]?.toLowerCase() ?? ''
  return (
    !GENERIC_PREFIXES.has(prefix) &&
    !prefix.includes('noreply') &&
    !prefix.includes('no-reply')
  )
}

export type EmailStatus =
  | 'hunter_valid'
  | 'hunter_accept_all'
  | 'hunter_invalid'
  | 'hunter_unknown'
  | 'hunter_unverified'

/** 对齐 Skill / C-02：Hunter verification.status → email_status */
export function mapHunterVerifierStatus(
  status: string | null | undefined,
): EmailStatus {
  if (status == null || status === '') return 'hunter_unverified'
  const s = status.toLowerCase()
  if (s === 'valid') return 'hunter_valid'
  if (s === 'accept_all') return 'hunter_accept_all'
  if (s === 'invalid' || s === 'disposable' || s === 'webmail') {
    return 'hunter_invalid'
  }
  return 'hunter_unknown'
}

export function todayYmd(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 手工录入合成 source（落盘 snake_case） */
export function manualSourceRecord(date = new Date()): {
  domain: string
  uri: string
  extracted_on: string
  last_seen_on: string
  still_on_page: boolean
} {
  const day = todayYmd(date)
  return {
    domain: 'manual',
    uri: 'urn:ftcs:manual',
    extracted_on: day,
    last_seen_on: day,
    still_on_page: true,
  }
}

export interface SortablePerson {
  email: string
  confidence: number
  title: string | null
  first_name: string | null
}

export function comparePersons(a: SortablePerson, b: SortablePerson): number {
  const aPersonal = isPersonalEmail(a.email)
  const bPersonal = isPersonalEmail(b.email)
  if (aPersonal !== bPersonal) return aPersonal ? -1 : 1
  if (a.confidence !== b.confidence) return b.confidence - a.confidence
  const aHasTitle = Boolean(a.title)
  const bHasTitle = Boolean(b.title)
  if (aHasTitle !== bHasTitle) return aHasTitle ? -1 : 1
  const aHasName = Boolean(a.first_name)
  const bHasName = Boolean(b.first_name)
  if (aHasName !== bHasName) return aHasName ? -1 : 1
  return 0
}

export function shouldAppendContactC7(person: {
  email: string
  email_status: string
  confidence: number
}): boolean {
  return (
    person.email_status === 'hunter_valid' &&
    person.confidence >= SYNC_CONFIDENCE_MIN &&
    isPersonalEmail(person.email)
  )
}
