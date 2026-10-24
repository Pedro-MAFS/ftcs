import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  emptySubagent,
  mergeSubagent,
  readTaskIdentity,
  taskResultBody,
  withSubagentStep,
} from './subagent-timeline.ts'

describe('subagent timeline', () => {
  it('从 task 入参读描述，不把 prompt 当标题', () => {
    const identity = readTaskIdentity({
      status: 'running',
      input: {
        description: 'R1 子代理',
        subagent_type: 'general',
        prompt: '很长的一段任务说明',
      },
      metadata: { sessionId: 'ses_child' },
    })
    assert.deepEqual(identity, {
      sessionId: 'ses_child',
      agent: 'general',
      description: 'R1 子代理',
    })
  })

  it('父工具更新时保留已有步骤', () => {
    const prev = withSubagentStep(
      emptySubagent(
        { sessionId: 'ses_child', agent: 'general', description: 'R1 子代理' },
        true,
        1,
      ),
      { id: 'p1', kind: 'tool', title: 'search_web 窗帘', body: '', status: 'running' },
    )
    const merged = mergeSubagent(
      prev,
      emptySubagent(
        { sessionId: 'ses_child', agent: 'general', description: 'R1 子代理' },
        false,
        99,
      ),
    )
    assert.equal(merged.toolCount, 1)
    assert.equal(merged.current, 'search_web 窗帘')
    assert.equal(merged.running, false)
    assert.equal(merged.startedAt, 1)
    assert.equal(taskResultBody({ status: 'running', input: { prompt: '不要出现' } }), '')
  })
})
