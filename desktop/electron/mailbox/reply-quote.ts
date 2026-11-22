// Require a mail header block as well as the divider. A dashed line alone is common in signatures.
export const originalMailDivider = /^\s*[-‐–—]{2,}\s*(?:原始邮件|原邮件|original message)\s*[-‐–—]{2,}\s*$/i
export function hasOriginalHeaders(text: string) {
  const header = text.trimStart().slice(0, 900)
  return (
    /^(?:发件人|寄件者|from)\s*[:：]/i.test(header) &&
    /(?:收件人|收件者|to)\s*[:：]/i.test(header) &&
    /(?:主题|主旨|subject)\s*[:：]/i.test(header)
  )
}

export function splitQuotedText(body: string) {
  const lines = body.split(/\r?\n/)
  let firstQuoted = lines.findIndex((line) => /^\s*>/.test(line))
  // Alternating quoted and unquoted lines can be an inline reply.
  if (firstQuoted >= 0 && lines.slice(firstQuoted).some((line) => line.trim() && !/^\s*>/.test(line)))
    return { body }
  const divider = lines.findIndex(
    (line, i) => originalMailDivider.test(line) && hasOriginalHeaders(lines.slice(i + 1, i + 12).join('\n')),
  )
  if (divider >= 0) firstQuoted = divider
  else if (firstQuoted > 0 && /(?:wrote\s*:|写道\s*[:：])\s*$/i.test(lines[firstQuoted - 1])) firstQuoted--
  if (firstQuoted < 0) return { body }
  return {
    body: lines.slice(0, firstQuoted).join('\n').trimEnd(),
    quote: lines.slice(firstQuoted).join('\n'),
  }
}
