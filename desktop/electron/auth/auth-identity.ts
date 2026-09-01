/** 用于跨次登录比对；优先 sub，其次 email */
export function buildLoginIdentity(input: {
  sub?: string
  email?: string
}): string {
  const sub = input.sub?.trim()
  if (sub) return `sub:${sub}`
  const email = input.email?.trim()
  if (email) return `email:${email.toLowerCase()}`
  return ''
}

export function shouldPromptGatewayReset(input: {
  previousIdentity: string | null
  currentIdentity: string
  officialProvisioned: boolean
  channelMode: 'official' | 'custom'
}): boolean {
  const current = input.currentIdentity.trim()
  if (!current) return false
  const previous = input.previousIdentity?.trim()
  if (!previous || previous === current) return false
  return input.channelMode === 'official' && input.officialProvisioned
}
