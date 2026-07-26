/** 站内信 blocks / ack 契约（与 user-api 首页文档一致） */

export type InboxBlockType = 'TEXT' | 'SINGLE' | 'MULTI' | 'TEXT_REPLY'

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

/** 用户中心统一响应：errorNo === 0 为成功 */
export interface BaseResponse<T> {
  errorNo: number
  errorInfo: string
  data?: T | null
}

export const DEFAULT_INBOX_POLL_MS = 60 * 60 * 1000
