/** 自由对话输入区（US-FD-01）。generating 仍只表示流水线任务。 */

export const FREE_DIALOGUE_PLACEHOLDER = '发消息继续聊，或说明要启动的获客步骤'
export const FREE_DIALOGUE_EMPTY_TIMELINE = '还没有对话。在下方输入即可。'
export const TASK_STARTING_TIMELINE = '任务启动中…'

export function emptyTimelineLabel(generating: boolean): string {
  return generating ? TASK_STARTING_TIMELINE : FREE_DIALOGUE_EMPTY_TIMELINE
}

/** 任务进行中，或自由回复这一轮，输入和发送都不可用。 */
export function composerInputLocked(generating: boolean, dialogueBusy: boolean): boolean {
  return generating || dialogueBusy
}

/** 流水线「中止」。自由回复不占用 generating，因此不会出现。 */
export function showTaskAbortButton(generating: boolean): boolean {
  return generating
}

/** 只停当前这一轮自由回复，不走任务中止。 */
export function showDialogueStopButton(generating: boolean, dialogueBusy: boolean): boolean {
  return dialogueBusy && !generating
}
