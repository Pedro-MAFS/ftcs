/** 掩码邮箱：11****74@qq.com */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '****'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!domain) return '****'
  if (local.length <= 2) return `**@${domain}`
  if (local.length <= 4) {
    return `${local[0]}****${local[local.length - 1]}@${domain}`
  }
  return `${local.slice(0, 2)}****${local.slice(-2)}@${domain}`
}
