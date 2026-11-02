/** 自由对话（US-FD-01）。不改任务 running，也不传 tools。 */

export const FREE_DIALOGUE_SESSION_TITLE = '自由对话'
export const FREE_DIALOGUE_TASK_BUSY = '任务进行中，请结束后再发'
export const FREE_DIALOGUE_NOT_READY = '服务未就绪，请稍后或重启应用'
export const FREE_DIALOGUE_STOPPED = '已停止这一轮回复'

export interface SendFreeDialogueResult {
  ok: boolean
  message: string
  /** 文本已进入当前会话。失败且未进入时，输入框可以还原草稿。 */
  accepted: boolean
}

export type FreeDialoguePlan =
  | { action: 'ignore' }
  | { action: 'block'; message: string }
  | { action: 'send'; text: string; createSession: boolean }

export function planFreeDialogue(input: {
  text: string
  running: boolean
  clientReady: boolean
  hasSession: boolean
}): FreeDialoguePlan {
  const text = input.text.trim()
  if (!text) return { action: 'ignore' }
  if (input.running) return { action: 'block', message: FREE_DIALOGUE_TASK_BUSY }
  if (!input.clientReady) return { action: 'block', message: FREE_DIALOGUE_NOT_READY }
  return { action: 'send', text, createSession: !input.hasSession }
}

/** 只带文本。不传 tools，避免盖掉会话权限。 */
export function freeDialoguePromptArgs(sessionID: string, text: string): {
  sessionID: string
  parts: [{ type: 'text'; text: string }]
} {
  return {
    sessionID,
    parts: [{ type: 'text', text }],
  }
}
