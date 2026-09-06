import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WorkflowPlan } from '../types/electron'
import { formatWorkflowFail, runWorkflowPreflight } from './useWorkflowExecute'

describe('useWorkflowExecute helpers', () => {
  it('formatWorkflowFail builds Chinese message', () => {
    assert.equal(
      formatWorkflowFail('标准获客', 'R2 社媒发现', '请先配置 Places Key'),
      '方案「标准获客」在步骤「R2 社媒发现」失败：请先配置 Places Key',
    )
  })

  it('T4 runWorkflowPreflight dedupes preflight kinds', async () => {
    const calls: string[] = []
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        checkAgentPreflight: async (kind: string) => {
          calls.push(kind)
          if (kind === 'discover-leads-r2') {
            return { ok: false, message: 'R2 环境未就绪', checks: [] }
          }
          return { ok: true, message: '', checks: [] }
        },
      },
    } as unknown as Window

    const plan: WorkflowPlan = {
      id: 'builtin-standard',
      name: '标准获客',
      builtin: true,
      steps: [
        { nodeId: 'discover-r1' },
        { nodeId: 'discover-r2' },
        { nodeId: 'discover-r2' },
        { nodeId: 'score-and-dedupe' },
      ],
    }

    const err = await runWorkflowPreflight(plan)
    assert.equal(err, 'R2 环境未就绪')
    assert.deepEqual(calls, ['discover-leads', 'discover-leads-r2'])
  })

  it('runWorkflowPreflight dedupes duplicate node kinds before failing later step', async () => {
    const calls: string[] = []
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        checkAgentPreflight: async (kind: string) => {
          calls.push(kind)
          return { ok: true, message: '', checks: [] }
        },
      },
    } as unknown as Window

    const plan: WorkflowPlan = {
      id: 'builtin-standard',
      name: '标准获客',
      builtin: true,
      steps: [
        { nodeId: 'discover-r1' },
        { nodeId: 'discover-r2' },
        { nodeId: 'discover-r2' },
        { nodeId: 'score-and-dedupe' },
      ],
    }

    const err = await runWorkflowPreflight(plan)
    assert.equal(err, null)
    assert.deepEqual(calls, ['discover-leads', 'discover-leads-r2', 'score-and-dedupe'])
  })
})
