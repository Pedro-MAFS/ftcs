const AVATAR_CHAR = /[\p{Letter}\p{Number}]/u
const LATIN = /\p{Script=Latin}/u

/**
 * 产品收起栏上的一个字。
 * trim 后按字素取第一个字母、数字或汉字；拉丁字母显示为大写。
 * 标点和符号跳过。跳完仍空则用「产」。
 */
export function productAvatarGlyph(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '产'

  const segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(trimmed)) {
    if (!AVATAR_CHAR.test(segment)) continue
    if (LATIN.test(segment)) return segment.toLocaleUpperCase('en-US')
    return segment
  }
  return '产'
}
