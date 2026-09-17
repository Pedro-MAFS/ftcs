export const EMAIL_DRAFT_STYLE_PROMPT_MAX = 500

/** 未配置或为空时的默认行文风格 */
export const DEFAULT_EMAIL_DRAFT_STYLE_PROMPT = '专业，真诚'

export type NormalizeStylePromptResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

/** trim + Unicode 码位长度校验（≤500） */
export function normalizeEmailDraftStylePrompt(raw: string): NormalizeStylePromptResult {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if ([...value].length > EMAIL_DRAFT_STYLE_PROMPT_MAX) {
    return { ok: false, message: `行文风格不超过 ${EMAIL_DRAFT_STYLE_PROMPT_MAX} 字` }
  }
  return { ok: true, value }
}

/** 从 prefs 原始值解析；缺省 / 非字符串 / 空 → 默认「专业，真诚」 */
export function resolveEmailDraftStylePrompt(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_EMAIL_DRAFT_STYLE_PROMPT
  const trimmed = raw.trim()
  return trimmed || DEFAULT_EMAIL_DRAFT_STYLE_PROMPT
}

/**
 * 注入到起草 / 重写 Agent Prompt。
 * 空则返回空串（不注入）。调用方传入 prefs 解析后的文案。
 */
export function formatEmailStylePromptBlock(stylePrompt: string): string {
  const text = stylePrompt.trim()
  if (!text) return ''
  return [
    '## 用户行文风格偏好（必须尽量遵循）',
    '以下为用户用自然语言描述的语气/偏好，请理解并落实到 subject 与 body；不要在正文中提及「按用户设置」等元叙述。',
    '"""',
    text,
    '"""',
    '',
  ].join('\n')
}
