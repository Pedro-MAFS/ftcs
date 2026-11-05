import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentEventPayload } from '../types/electron'
import { waitForAgentDone } from './wait-for-agent-done'

type AgentListener = (payload: AgentEventPayload) => void

describe('waitForAgentDone', () => {
  it('T6 resolves when matching taskId completes, ignoring an earlier task on the same product', async () => {
    let listener: AgentListener | null = null
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        onAgentEvent: (handler: AgentListener) => {
          listener = handler
          return () => {
            listener = null
          }
        },
      },
    } as unknown as Window

    const pending = waitForAgentDone('prod_1')
    assert.ok(listener)
    const emit = listener as AgentListener
    const record = { session_id: 'session', scope: { product_id: 'same-product' }, origin: 'workflow' as const,
      task_type: 'expand-keywords' as const, state: 'succeeded' as const, started_at: 'start', finished_at: 'end', revision: 3, message: '完成' }
    emit({ type: 'task.changed', task: { ...record, task_id: 'earlier' } })
    emit({ type: 'task.changed', task: { ...record, task_id: 'prod_1' } })
    const result = await pending
    assert.equal(result.ok, true)
    assert.equal(result.message, '完成')
  })

  it('ignores non-done events', async () => {
    let listener: AgentListener | null = null
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        onAgentEvent: (handler: AgentListener) => {
          listener = handler
          return () => {
            listener = null
          }
        },
      },
    } as unknown as Window

    const pending = waitForAgentDone('prod_1', { timeoutMs: 50 })
    assert.ok(listener)
    ;(listener as AgentListener)({
      type: 'state',
      skill: 'discover-leads',
      status: 'running',
      meta: [],
    })

    await assert.rejects(pending, /超时/)
  })

  it('rejects when aborted', async () => {
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        onAgentEvent: () => () => undefined,
      },
    } as unknown as Window

    const ac = new AbortController()
    ac.abort()
    await assert.rejects(
      waitForAgentDone('prod_1', { signal: ac.signal }),
      (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
    )
  })
})
