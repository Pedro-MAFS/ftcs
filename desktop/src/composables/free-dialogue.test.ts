import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  FREE_DIALOGUE_EMPTY_TIMELINE,
  FREE_DIALOGUE_PLACEHOLDER,
  PERMISSION_PENDING_SEND_HINT,
  composerInputLocked,
  emptyTimelineLabel,
  showDialogueStopButton,
  showTaskAbortButton,
} from './free-dialogue.ts'

describe('free dialogue composer', () => {
  it('uses the open-dialogue placeholder and empty timeline copy', () => {
    assert.equal(FREE_DIALOGUE_PLACEHOLDER, '发消息继续聊，或说明要启动的获客步骤')
    assert.equal(emptyTimelineLabel(false), FREE_DIALOGUE_EMPTY_TIMELINE)
    assert.equal(FREE_DIALOGUE_EMPTY_TIMELINE, '还没有对话。在下方输入即可。')
    assert.equal(emptyTimelineLabel(true), '任务启动中…')
    assert.equal(FREE_DIALOGUE_PLACEHOLDER.includes('暂未开放'), false)
    assert.equal(FREE_DIALOGUE_EMPTY_TIMELINE.includes('生成画像'), false)
  })

  it('locks input while a task runs, and shows 中止 rather than 停止', () => {
    assert.equal(composerInputLocked(true, false), true)
    assert.equal(showTaskAbortButton(true), true)
    assert.equal(showDialogueStopButton(true, false), false)
    assert.equal(showDialogueStopButton(true, true), false)
  })

  it('locks input during a free reply without treating it as a running task', () => {
    assert.equal(composerInputLocked(false, true), true)
    assert.equal(showTaskAbortButton(false), false)
    assert.equal(showDialogueStopButton(false, true), true)
    assert.equal(composerInputLocked(false, false), false)
    assert.equal(showDialogueStopButton(false, false), false)
  })

  it('keeps send available while an auth card is up so typed 同意 is not approval', () => {
    assert.equal(PERMISSION_PENDING_SEND_HINT, '请先同意或拒绝上面的授权')
    assert.equal(composerInputLocked(false, true, true), false)
    assert.equal(composerInputLocked(true, false, true), false)
    assert.equal(composerInputLocked(false, false, false), false)
  })
})

describe('AgentPanel free-dialogue copy', () => {
  it('drops the closed-dialogue sentences', () => {
    const src = readFileSync(new URL('../components/layout/AgentPanel.vue', import.meta.url), 'utf8')
    assert.equal(src.includes('自由对话暂未开放'), false)
    assert.equal(src.includes('暂不支持在对话区自由发送'), false)
    assert.equal(src.includes('点击「生成画像」后，此处按时间顺序展示过程'), false)
    assert.equal(src.includes('FREE_DIALOGUE_PLACEHOLDER'), true)
    assert.equal(src.includes('emptyTimelineLabel'), true)
    assert.equal(src.includes('dialogueBusy'), true)
    assert.equal(src.includes('showDialogueStopButton'), true)
    assert.equal(src.includes('abortProfile'), true)
    assert.equal(src.includes('PERMISSION_PENDING_SEND_HINT'), true)
    assert.equal(src.includes('pendingPermission.value'), true)
    assert.equal(src.includes("send(text, activeProductId.value)"), true)
    assert.equal(src.includes('replyPermission'), false)
  })
})
