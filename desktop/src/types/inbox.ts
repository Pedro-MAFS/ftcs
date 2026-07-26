export type InboxBlock =
  | { type: 'TEXT'; body: string }
  | { type: 'SINGLE'; id: string; title: string; options: string[] }
  | { type: 'MULTI'; id: string; title: string; options: string[] }
  | { type: 'TEXT_REPLY'; id: string; title: string; maxLength?: number }

export interface InboxMessage {
  messageId: string
  createTime: string
  expireAt: string
  blocks: InboxBlock[]
}

export interface InboxAnswer {
  questionId: string
  optionIndexes?: number[]
  text?: string
}

export interface InboxConfig {
  pollIntervalMs: number
}

export interface InboxPullResult {
  ok: boolean
  message: string
  items?: InboxMessage[]
  needLogin?: boolean
}

export interface InboxAckResult {
  ok: boolean
  message: string
  needLogin?: boolean
}

/** 单题本地草稿 */
export interface InboxDraftAnswer {
  optionIndexes?: number[]
  text?: string
}
