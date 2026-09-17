/** 与 lead-store E3 冻结表对齐（桌面侧复刻，供收件人池） */
export const GENERIC_EMAIL_LOCAL_PARTS = new Set([
  'info',
  'sales',
  'contact',
  'contacts',
  'admin',
  'support',
  'hello',
  'office',
  'mail',
  'enquiry',
  'inquiry',
  'service',
  'help',
  'team',
  'marketing',
  'business',
  'export',
  'import',
  'purchase',
  'purchasing',
  'buyer',
  'buyers',
])

export type EmailRecipientPoolItem = {
  recipientKey: string
  kind: 'company' | 'person'
  email: string | null
  /** 公司向：全部通用级邮箱（主收件在前）；个人向通常为单元素 */
  emails: string[]
  displayName: string
  title: string | null
  emailLevel: 'generic' | 'personal' | null
  source: 'slot' | 'contacts' | 'people' | 'both'
  hasDraft: boolean
  draftStatus: string | null
}

export type PoolContact = { type: string; value: string }
export type PoolPerson = {
  email: string
  firstName: string | null
  name: string | null
  title: string | null
}
export type PoolSlot = {
  recipientKey: string
  slotKind: 'company' | 'person'
  email: string
  name: string
  status: string
}

function normalizeEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return null
  return normalized
}

export function classifyEmailLevel(
  email: string,
): 'generic' | 'personal' | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const local = normalized.split('@')[0] ?? ''
  return GENERIC_EMAIL_LOCAL_PARTS.has(local) ? 'generic' : 'personal'
}

function displayFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local || email
}

/**
 * E5 收件人池：公司向槽 + contacts∪people（邮箱去重）
 */
export function buildEmailRecipientPool(input: {
  companyName: string
  contacts: PoolContact[]
  people: PoolPerson[]
  slots: PoolSlot[]
  recipientKeyFromEmail: (email: string) => string | null
}): EmailRecipientPoolItem[] {
  const companySlot = input.slots.find((s) => s.slotKind === 'company')
  const personSlotsByKey = new Map(
    input.slots.filter((s) => s.slotKind === 'person').map((s) => [s.recipientKey, s]),
  )

  let preferredGeneric: string | null = null
  const genericEmails: string[] = []
  const seenGeneric = new Set<string>()
  const pushGeneric = (raw: string) => {
    const email = normalizeEmail(raw)
    if (!email || classifyEmailLevel(email) !== 'generic') return
    if (seenGeneric.has(email)) return
    seenGeneric.add(email)
    genericEmails.push(email)
    if (!preferredGeneric) preferredGeneric = email
  }

  for (const c of input.contacts) {
    if (c.type !== 'email') continue
    pushGeneric(c.value)
  }
  for (const p of input.people) {
    pushGeneric(p.email)
  }
  if (companySlot?.email) pushGeneric(companySlot.email)

  const companyEmail =
    (companySlot?.email ? normalizeEmail(companySlot.email) : null) ||
    preferredGeneric

  const companyEmails = companyEmail
    ? [companyEmail, ...genericEmails.filter((e) => e !== companyEmail)]
    : [...genericEmails]

  const pool: EmailRecipientPoolItem[] = [
    {
      recipientKey: 'company',
      kind: 'company',
      email: companyEmail,
      emails: companyEmails,
      displayName: '公司向',
      title: null,
      emailLevel: null,
      source: 'slot',
      hasDraft: Boolean(companySlot),
      draftStatus: companySlot?.status ?? null,
    },
  ]

  type Acc = {
    email: string
    key: string
    fromContacts: boolean
    fromPeople: boolean
    firstName: string | null
    name: string | null
    title: string | null
  }
  const byEmail = new Map<string, Acc>()

  for (const c of input.contacts) {
    if (c.type !== 'email') continue
    const email = normalizeEmail(c.value)
    if (!email) continue
    // 通用级邮箱收束到公司向芯片，不单独展开
    if (classifyEmailLevel(email) === 'generic') continue
    const key = input.recipientKeyFromEmail(email)
    if (!key || key === 'company') continue
    const prev = byEmail.get(email)
    if (prev) {
      prev.fromContacts = true
    } else {
      byEmail.set(email, {
        email,
        key,
        fromContacts: true,
        fromPeople: false,
        firstName: null,
        name: null,
        title: null,
      })
    }
  }

  for (const p of input.people) {
    const email = normalizeEmail(p.email)
    if (!email) continue
    if (classifyEmailLevel(email) === 'generic') continue
    const key = input.recipientKeyFromEmail(email)
    if (!key || key === 'company') continue
    const prev = byEmail.get(email)
    if (prev) {
      prev.fromPeople = true
      prev.firstName = p.firstName || prev.firstName
      prev.name = p.name || prev.name
      prev.title = p.title || prev.title
    } else {
      byEmail.set(email, {
        email,
        key,
        fromContacts: false,
        fromPeople: true,
        firstName: p.firstName,
        name: p.name,
        title: p.title,
      })
    }
  }

  const persons: EmailRecipientPoolItem[] = []
  for (const acc of byEmail.values()) {
    const slot = personSlotsByKey.get(acc.key)
    const displayName =
      (acc.firstName || '').trim() ||
      (acc.name || '').trim().split(/\s+/)[0] ||
      displayFromEmail(acc.email)
    let source: EmailRecipientPoolItem['source'] = 'contacts'
    if (acc.fromContacts && acc.fromPeople) source = 'both'
    else if (acc.fromPeople) source = 'people'
    persons.push({
      recipientKey: acc.key,
      kind: 'person',
      email: acc.email,
      emails: [acc.email],
      displayName,
      title: acc.title,
      emailLevel: classifyEmailLevel(acc.email),
      source,
      hasDraft: Boolean(slot),
      draftStatus: slot?.status ?? null,
    })
  }

  persons.sort((a, b) => {
    if (a.hasDraft !== b.hasDraft) return a.hasDraft ? -1 : 1
    const an = a.displayName.toLowerCase()
    const bn = b.displayName.toLowerCase()
    if (an !== bn) return an.localeCompare(bn)
    return (a.email || '').localeCompare(b.email || '')
  })

  return [...pool, ...persons]
}

export function pickDefaultRecipientKey(
  pool: EmailRecipientPoolItem[],
): string {
  const company = pool.find((p) => p.kind === 'company')
  if (company?.hasDraft) return 'company'
  const withDraft = pool.find((p) => p.kind === 'person' && p.hasDraft)
  if (withDraft) return withDraft.recipientKey
  return company?.recipientKey ?? 'company'
}
