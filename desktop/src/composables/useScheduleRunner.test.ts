import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRenderer, defineComponent } from 'vue'
import type { ScheduleTriggerPayload } from '../types/electron'
import { useScheduleRunner } from './useScheduleRunner'
import { useToast } from './useToast'
import { useWorkspace } from './useWorkspace'

describe('scheduled tasks with deleted products', () => {
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

    const renderer = createRenderer({
      patchProp() {}, insert() {}, remove() {}, setText() {}, setElementText() {},
      parentNode: () => null, nextSibling: () => null,
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    })
    const app = renderer.createApp(defineComponent({
      setup() { useScheduleRunner(); return () => null },
    }))
    app.mount({})

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
})
