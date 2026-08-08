/** RFC4180 风格：字段含逗号/引号/换行时用双引号包裹，内部 " 转义为 "" */
export function escapeCsvCell(value: string): string {
  const text = value ?? ''
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}
