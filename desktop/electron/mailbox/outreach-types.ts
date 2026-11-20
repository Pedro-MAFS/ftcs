import { validAddress, type SendResult } from './compose-types'
import type { OutreachBinding } from '../../../workspace/mcp-servers/lead-store/src/outreach-binding'

export type { OutreachBinding }
export interface ReviewSlot {
  productId: string
  leadId: string
  recipientKey: string
}
export interface ReviewSend extends ReviewSlot {
  version: string
  request: string
  to: string
  subject: string
  body: string
}
export interface OutreachSource {
  kind: 'outreach'
  product_id: string
  lead_id: string
  recipient_key: string
  review_id: string
}
export interface OutreachResult extends SendResult {
  contact: string
  message: string
  at: string
  from: string
}
export function reviewAddresses(
  detail: { email: string; recipientAliases: string[] },
  item?: {
    kind: 'person' | 'company'
    email: string | null
    emails?: string[]
  } | null,
) {
  const candidates =
    item?.kind === 'company'
      ? [detail.email, item.email, ...(item.emails ?? []), ...detail.recipientAliases]
      : [detail.email || item?.email]
  return [...new Set(candidates.map((e) => e?.trim().toLowerCase() ?? '').filter(validAddress))]
}
