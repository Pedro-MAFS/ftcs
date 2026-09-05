/** 与 `electron/library/library-image.ts` 保持一致（US-I-12） */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] as const

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTENSIONS)

function extensionOf(relativePath: string): string {
  const base = relativePath.replace(/\\/g, '/')
  const slash = base.lastIndexOf('/')
  const name = slash >= 0 ? base.slice(slash + 1) : base
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

export function isImageFile(relativePath: string): boolean {
  return IMAGE_EXT_SET.has(extensionOf(relativePath))
}

export function listImageFiles(filePaths: readonly string[]): string[] {
  return filePaths.filter((p) => isImageFile(p))
}

export function hasImageFiles(filePaths: readonly string[]): boolean {
  return filePaths.some((p) => isImageFile(p))
}
