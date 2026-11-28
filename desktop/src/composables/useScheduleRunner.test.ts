import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRenderer, defineComponent } from 'vue'
import type { ScheduleTriggerPayload } from '../types/electron'
import { useScheduleRunner } from './useScheduleRunner'
import { useWorkflowExecute } from './useWorkflowExecute'
import { useToast } from './useToast'
import { useWorkspace } from './useWorkspace'

function mountRunner() {
  const renderer = createRenderer({
    patchProp() {}, insert() {}, remove() {}, setText() {}, setElementText() {},
    parentNode: () => null, nextSibling: () => null,
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  })
  const app = renderer.createApp(defineComponent({
    setup() { useScheduleRunner(); return () => null },
  }))
  app.mount({})
  return app
}

describe('scheduled task execution', () => {
  it('reports the problem without switching product or starting the plan', async () => {
    let trigger: ((payload: ScheduleTriggerPayload) => void) | undefined
    const marks: unknown[] = []
    let plansRequested = 0
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        getProfile: async () => ({ id: 'deleted-product', status: 'deleted' }),
        listWorkflowPlans: async () => { plansRequested += 1; return { ok: true, plans: [] } },
        markWorkflowScheduleRun: async (input: unknown) => { marks.push(input); return { ok: true } },
        onScheduleTrigger: (handler: typeof trigger) => { trigger = handler; return () => {} },
      },
    } as unknown as Window

    const app = mountRunner()

    const workspace = useWorkspace()
    workspace.activeProductId.value = 'existing-product'
    assert.ok(trigger)
    trigger({ scheduleId: 'schedule-1', productId: 'deleted-product', planId: 'plan-1', reason: 'due' })
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(workspace.activeProductId.value, 'existing-product')
    assert.equal(plansRequested, 0)
    assert.deepEqual(marks, [{ scheduleId: 'schedule-1', skipped: false, ok: false }])
    const { toasts, dismissToast } = useToast()
    assert.match(toasts.value.at(-1)?.message ?? '', /产品.*已删除或不存在/)
    for (const toast of toasts.value) dismissToast(toast.id)
    app.unmount()
  })
  it('identifies the triggering schedule across views and clears it after success, failure or cancellation', async () => {
    let trigger!: (payload: ScheduleTriggerPayload) => void
    let finishStep!: (id: string) => void
    let failStep!: (error: Error) => void
    const marks: Array<{ scheduleId: string; ok: boolean }> = []
    const flush = () => new Promise<void>(resolve => setImmediate(resolve))
    ;(globalThis as unknown as { window: Window }).window = {
      ftcs: {
        onScheduleTrigger: (handler: typeof trigger) => { trigger = handler; return () => {} },
        getProfile: async () => ({ id: 'p', status: 'ready' }),
        listWorkflowPlans: async () => ({ ok: true, plans: [{ id: 'plan', name: '方案', steps: [{ nodeId: 'discover-r1' }] }] }),
        checkAgentPreflight: async () => ({ ok: true }),
        launchWorkflowStep: () => new Promise<string>((resolve, reject) => { finishStep = resolve; failStep = reject }),
        onAgentEvent: () => () => {},
        taskSnapshot: async () => [{ task_id: 'step', state: 'succeeded', finished_at: 'done', message: '' }],
        markWorkflowScheduleRun: async (mark: typeof marks[number]) => { marks.push(mark) },
      },
    } as unknown as Window
    const app = mountRunner()
    try {
      const observer = useWorkflowExecute()
      for (const outcome of ['success', 'failure', 'cancel']) {
        const scheduleId = 'schedule-' + outcome
        trigger({ scheduleId, productId: 'p', planId: 'plan', reason: 'due' })
        await flush()
        assert.equal(observer.runningScheduleId.value, scheduleId)
        assert.equal(useWorkflowExecute().currentStepLabel.value, '全网搜索')
        if (outcome === 'failure') failStep(new Error('步骤失败'))
        else {
          if (outcome === 'cancel') await observer.cancel()
          finishStep('step')
        }
        await flush()
        assert.equal(observer.runningScheduleId.value, null)
        assert.deepEqual(marks.at(-1), { scheduleId, skipped: false, ok: outcome === 'success' })
      }
      const manual = observer.executePlan('plan')
      await flush()
      assert.equal(observer.running.value, true)
      assert.equal(observer.runningScheduleId.value, null)
      finishStep('step')
      await manual
    } finally {
      const { toasts, dismissToast } = useToast()
      for (const toast of [...toasts.value]) dismissToast(toast.id)
      app.unmount()
    }
  })
})
