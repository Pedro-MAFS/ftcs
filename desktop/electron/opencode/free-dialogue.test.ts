import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FREE_DIALOGUE_NOT_READY,
  FREE_DIALOGUE_SESSION_TITLE,
  FREE_DIALOGUE_TASK_BUSY,
  freeDialoguePromptArgs,
  planFreeDialogue,
} from './free-dialogue.ts'

describe('planFreeDialogue', () => {
  it('does not send empty text', () => {
    assert.deepEqual(
      planFreeDialogue({ text: '  \n', running: false, clientReady: true, hasSession: false }),
      { action: 'ignore' },
    )
    assert.deepEqual(
      planFreeDialogue({ text: '', running: true, clientReady: false, hasSession: true }),
      { action: 'ignore' },
    )
  })

  it('blocks while a pipeline task is running and does not ask to create a session', () => {
    assert.deepEqual(
      planFreeDialogue({ text: '用三句话解释信用证', running: true, clientReady: true, hasSession: true }),
      { action: 'block', message: FREE_DIALOGUE_TASK_BUSY },
    )
  })

  it('keeps the existing not-ready hint when the service is down', () => {
    assert.equal(FREE_DIALOGUE_NOT_READY, '服务未就绪，请稍后或重启应用')
    assert.deepEqual(
      planFreeDialogue({ text: '你好', running: false, clientReady: false, hasSession: false }),
      { action: 'block', message: FREE_DIALOGUE_NOT_READY },
    )
  })

  it('creates a session only when the controller has none', () => {
    assert.deepEqual(
      planFreeDialogue({ text: ' 用三句话解释信用证 ', running: false, clientReady: true, hasSession: false }),
      { action: 'send', text: '用三句话解释信用证', createSession: true },
    )
    assert.deepEqual(
      planFreeDialogue({ text: '再问一句', running: false, clientReady: true, hasSession: true }),
      { action: 'send', text: '再问一句', createSession: false },
    )
  })

  it('names a new free-dialogue session 自由对话', () => {
    assert.equal(FREE_DIALOGUE_SESSION_TITLE, '自由对话')
  })
})

describe('freeDialoguePromptArgs', () => {
  it('sends text only and does not pass tools', () => {
    const args = freeDialoguePromptArgs('ses_keep', '用三句话解释信用证')
    assert.deepEqual(args, {
      sessionID: 'ses_keep',
      parts: [{ type: 'text', text: '用三句话解释信用证' }],
    })
    assert.equal(Object.hasOwn(args, 'tools'), false)
  })
})
