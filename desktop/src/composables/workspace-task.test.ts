import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEventPayload } from '../types/electron'
import type { TaskRecord } from '../../electron/tasks/lifecycle'
import { useWorkspace, whenPipelineReady } from './useWorkspace'

test('同一任务更新状态卡与所属产品流水线，切换产品后的终态和迟到读取不会覆盖新产品', async () => {
  let emit!: (event: AgentEventPayload) => void
  let resolveOldRead!: (profile: { id: string; status: string }) => void
  const waitOld = new Promise<{ id: string; status: string }>((resolve) => {
    resolveOldRead = resolve
  })
  let slow = false
  const reads: string[] = []
  Object.assign(globalThis, {
    window: {
      ftcs: {
        onAgentEvent: (handler: typeof emit) => {
          emit = handler
        },
        taskSnapshot: async () => [],
        listProfiles: async () => ['A', 'B'].map((id) => ({ id, status: 'ready' })),
        getProfile: async (id: string) => (id === 'A' && slow ? waitOld : { id, status: 'ready' }),
        listExploreTasks: async (id: string) => {
          reads.push(id)
          return { summary: { completed: 0 }, expansion: null }
        },
      },
    },
  })
  const ui = useWorkspace()
  await whenPipelineReady()
  const task: TaskRecord = {
    task_id: 'one',
    session_id: 'chat',
    origin: 'chat',
    task_type: 'expand-keywords',
    scope: { product_id: 'A' },
    state: 'running',
    revision: 2,
    message: '执行中',
    started_at: 'start',
  }
  emit({ type: 'task.changed', task })
  assert.equal(ui.agentStatus.value, 'running')
  assert.equal(ui.pipelineSteps.value.find((s) => s.id === 'keywords')?.status, 'running')
  slow = true
  const old = ui.loadActiveProfile()
  ui.selectProduct('B')
  await new Promise((resolve) => setImmediate(resolve))
  const count = reads.length
  emit({
    type: 'task.changed',
    task: { ...task, state: 'partial', revision: 3, message: '部分保存', finished_at: 'end' },
  })
  emit({ type: 'task.changed', task })
  resolveOldRead({ id: 'A', status: 'draft' })
  await old
  assert.equal(ui.currentProfile.value?.id, 'B')
  assert.equal(ui.activeProductId.value, 'B')
  assert.equal(ui.latestTask.value?.state, 'partial')
  assert.equal(ui.pipelineSteps.value.find((s) => s.id === 'keywords')?.status, 'pending')
  assert.equal(reads.length, count)
  ui.agentPrompt.value = '未发送的内容'
  emit({ type: 'session.created' })
  assert.equal(ui.agentStatus.value, 'idle')
  assert.equal(ui.agentPrompt.value, '')
  assert.equal(ui.agentTimeline.value.length, 0)
  assert.equal(ui.activeProductId.value, 'B')
})
