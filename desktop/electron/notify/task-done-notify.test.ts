import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  resolveTaskDoneNotificationEnabled,
  shouldShowTaskDoneNotification,
  truncateTaskDoneNotifyBody,
  setWorkflowNotifySuppressed,
  isWorkflowNotifySuppressed,
  resetWorkflowNotifySuppressedForTests,
  TASK_DONE_NOTIFY_BODY_MAX,
  TASK_DONE_NOTIFY_TITLE,
} from './task-done-notify-logic'

describe('task-done-notify-logic', () => {
  beforeEach(() => {
    resetWorkflowNotifySuppressedForTests()
  })

  it('resolve：缺省与非法为 true，仅 false 关闭', () => {
    assert.equal(resolveTaskDoneNotificationEnabled(undefined), true)
    assert.equal(resolveTaskDoneNotificationEnabled(null), true)
    assert.equal(resolveTaskDoneNotificationEnabled('no'), true)
    assert.equal(resolveTaskDoneNotificationEnabled(true), true)
    assert.equal(resolveTaskDoneNotificationEnabled(false), false)
  })

  it('truncate：空与上限', () => {
    assert.equal(truncateTaskDoneNotifyBody('  hi  '), 'hi')
    assert.equal(truncateTaskDoneNotifyBody(''), '')
    const ok = '字'.repeat(TASK_DONE_NOTIFY_BODY_MAX)
    assert.equal(truncateTaskDoneNotifyBody(ok), ok)
    const over = '字'.repeat(TASK_DONE_NOTIFY_BODY_MAX + 5)
    const truncated = truncateTaskDoneNotifyBody(over)
    assert.equal([...truncated].length, TASK_DONE_NOTIFY_BODY_MAX + 1)
    assert.ok(truncated.endsWith('…'))
  })

  it('标题常量', () => {
    assert.equal(TASK_DONE_NOTIFY_TITLE, 'FTCS·外贸获客智能体')
  })

  it('shouldShow 真值表', () => {
    const base = {
      enabled: true,
      suppressed: false,
      supported: true,
      window: { isFocused: false, isMinimized: false },
    }
    assert.equal(shouldShowTaskDoneNotification(base), true)
    assert.equal(
      shouldShowTaskDoneNotification({ ...base, enabled: false }),
      false,
    )
    assert.equal(
      shouldShowTaskDoneNotification({ ...base, suppressed: true }),
      false,
    )
    assert.equal(
      shouldShowTaskDoneNotification({ ...base, supported: false }),
      false,
    )
    assert.equal(
      shouldShowTaskDoneNotification({ ...base, window: null }),
      false,
    )
    assert.equal(
      shouldShowTaskDoneNotification({
        ...base,
        window: { isFocused: true, isMinimized: false },
      }),
      false,
    )
    assert.equal(
      shouldShowTaskDoneNotification({
        ...base,
        window: { isFocused: true, isMinimized: true },
      }),
      true,
    )
    assert.equal(
      shouldShowTaskDoneNotification({
        ...base,
        window: { isFocused: false, isMinimized: true },
      }),
      true,
    )
  })

  it('编排抑制 flag', () => {
    assert.equal(isWorkflowNotifySuppressed(), false)
    setWorkflowNotifySuppressed(true)
    assert.equal(isWorkflowNotifySuppressed(), true)
    setWorkflowNotifySuppressed(false)
    assert.equal(isWorkflowNotifySuppressed(), false)
  })
})
