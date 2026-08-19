export const OFFICE_GATE_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const

const OFFICE_GATE_SET = new Set<string>(OFFICE_GATE_EXTENSIONS)

function extensionOf(relativePath: string): string {
  const base = relativePath.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const name = slash >= 0 ? base.slice(slash + 1) : base
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

export function isOfficeGateFile(relativePath: string): boolean {
  return OFFICE_GATE_SET.has(extensionOf(relativePath))
}

export function listOfficeGateFiles(filePaths: readonly string[]): string[] {
  return filePaths.filter((p) => isOfficeGateFile(p))
}

export function stripOfficeGateFiles(filePaths: readonly string[]): string[] {
  return filePaths.filter((p) => !isOfficeGateFile(p))
}

export function hasOfficeGateFiles(filePaths: readonly string[]): boolean {
  return filePaths.some((p) => isOfficeGateFile(p))
}
