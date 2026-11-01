import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_RATIOS,
  computeColumnPixels,
  createWorkspaceLayout,
  type MainViewLayout,
} from './useWorkspaceLayout.ts'

function layoutAt(bodyWidth: number) {
  const writes: MainViewLayout[] = []
  const layout = createWorkspaceLayout({
    bodyWidth,
    write(value) {
      writes.push(value)
    },
  })
  return { layout, writes }
}

describe('computeColumnPixels', () => {
  const open: MainViewLayout = {
    ratios: { ...DEFAULT_RATIOS },
    pipelineCollapsed: false,
    agentCollapsed: false,
    fill: 'none',
    beforeFill: null,
  }

  it('uses 236 / 544 / 340 on the default 1180 window', () => {
    const widths = computeColumnPixels(1180, open)
    assert.deepEqual(widths, {
      rail: 48,
      pipeline: 236,
      main: 544,
      agent: 340,
      splitter: 6,
    })
  })

  it('clamps the default ratios to 200 / 400 / 300 at 960', () => {
    const widths = computeColumnPixels(960, open)
    assert.equal(widths.pipeline, 200)
    assert.equal(widths.main, 400)
    assert.equal(widths.agent, 300)
    assert.equal(widths.rail + widths.pipeline + widths.main + widths.agent + widths.splitter * 2, 960)
  })

  it('takes the deficit from the other column after main is at 360', () => {
    const widths = computeColumnPixels(960, {
      ...open,
      ratios: { pipeline: 0.8, main: 0.1, agent: 0.1 },
    })
    assert.equal(widths.main, 360)
    assert.equal(widths.pipeline, 240)
    assert.equal(widths.agent, 300)
  })
})

describe('createWorkspaceLayout', () => {
  it('does not write while resizing or while the pointer is still down', () => {
    const { layout, writes } = layoutAt(1180)
    layout.setBodyWidth(960)
    layout.setBodyWidth(1180)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    assert.equal(layout.getWidths().pipeline, 236)
    assert.equal(layout.getWidths().agent, 340)
    assert.equal(writes.length, 0)

    layout.beginSplitterDrag('left', 100)
    layout.updateSplitterDrag(80)
    assert.equal(writes.length, 0)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    assert.equal(layout.getWidths().pipeline, 216)
    layout.endSplitterDrag()
    assert.equal(writes.length, 1)
    assert.equal(layout.getWidths().pipeline, 216)
    assert.equal(layout.getLayout().pipelineCollapsed, false)
  })

  it('stops at the pipeline minimum and stays expanded', () => {
    const { layout } = layoutAt(1180)
    layout.beginSplitterDrag('left', 100)
    layout.updateSplitterDrag(-400)
    assert.equal(layout.getWidths().pipeline, 200)
    assert.equal(layout.getLayout().pipelineCollapsed, false)
    layout.endSplitterDrag()
    assert.equal(layout.getWidths().pipeline, 200)
    assert.equal(layout.getLayout().pipelineCollapsed, false)
    assert.equal(layout.getWidths().agent, 340)
  })

  it('keeps ratios when collapsing and restores the same pixels when expanding', () => {
    const { layout, writes } = layoutAt(1180)
    layout.togglePipelineCollapsed()
    assert.equal(writes.length, 1)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    assert.equal(layout.getWidths().pipeline, 44)
    assert.equal(layout.canDragSplitter('left'), false)
    assert.equal(layout.canDragSplitter('right'), true)
    layout.togglePipelineCollapsed()
    assert.equal(layout.getWidths().pipeline, 236)
    assert.equal(layout.getWidths().main, 544)
    assert.equal(layout.getWidths().agent, 340)
  })

  it('hides the side columns while main is filled and restores the snapshot', () => {
    const { layout, writes } = layoutAt(1180)
    layout.toggleAgentCollapsed()
    layout.enterFill('main')
    assert.equal(layout.getLayout().fill, 'main')
    assert.equal(layout.getLayout().beforeFill?.agentCollapsed, true)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    assert.deepEqual(layout.getWidths(), {
      rail: 0,
      pipeline: 0,
      main: 1180,
      agent: 0,
      splitter: 0,
    })
    assert.equal(layout.canDragSplitter('left'), false)

    const written = writes.length
    layout.enterFill('main')
    layout.enterFill('agent')
    assert.equal(writes.length, written)
    assert.equal(layout.getLayout().fill, 'main')

    layout.exitFill()
    assert.equal(layout.getLayout().fill, 'none')
    assert.equal(layout.getLayout().beforeFill, null)
    assert.equal(layout.getLayout().agentCollapsed, true)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    const restored = layout.getWidths()
    assert.equal(restored.agent, 44)
    assert.ok(restored.pipeline >= 200)
    assert.equal(restored.rail + restored.pipeline + restored.main + restored.agent + restored.splitter * 2, 1180)
  })

  it('does not turn a click on the splitter into a new ratio', () => {
    const { layout, writes } = layoutAt(960)
    assert.equal(layout.getWidths().pipeline, 200)
    layout.beginSplitterDrag('left', 10)
    layout.endSplitterDrag()
    assert.equal(writes.length, 0)
    assert.deepEqual(layout.getLayout().ratios, DEFAULT_RATIOS)
    layout.setBodyWidth(1180)
    assert.equal(layout.getWidths().pipeline, 236)
    assert.equal(layout.getWidths().agent, 340)
  })

  it('gives the body width to the agent while filled without rewriting ratios to 1', () => {
    const { layout } = layoutAt(1180)
    layout.enterFill('agent')
    assert.equal(layout.getWidths().agent, 1180)
    assert.equal(layout.getWidths().main, 0)
    assert.ok(layout.getLayout().ratios.main > 0)
    assert.ok(layout.getLayout().ratios.pipeline > 0)
    layout.exitFill()
    assert.equal(layout.getWidths().main, 544)
    assert.equal(layout.getWidths().pipeline, 236)
    assert.equal(layout.getWidths().agent, 340)
  })

  it('ignores collapse while a column is filled', () => {
    const { layout, writes } = layoutAt(1180)
    layout.enterFill('agent')
    const written = writes.length
    layout.togglePipelineCollapsed()
    layout.toggleAgentCollapsed()
    assert.equal(writes.length, written)
    assert.equal(layout.getLayout().pipelineCollapsed, false)
    assert.equal(layout.getLayout().agentCollapsed, false)
  })

  it('draws the pipeline expanded while settings is open without changing the collapsed bit', () => {
    const { layout, writes } = layoutAt(1180)
    layout.togglePipelineCollapsed()
    assert.equal(layout.getWidths().pipeline, 44)
    const written = writes.length
    layout.noteSettingsOpen(true)
    assert.equal(layout.getLayout().pipelineCollapsed, true)
    assert.equal(layout.pipelineColumnCollapsed.value, false)
    assert.equal(layout.getWidths().pipeline, 236)
    assert.equal(writes.length, written)

    layout.collapsePipelineColumn()
    assert.equal(layout.getLayout().pipelineCollapsed, true)
    assert.equal(layout.getWidths().pipeline, 44)
    assert.equal(writes.length, written)

    layout.noteSettingsOpen(false)
    assert.equal(layout.getWidths().pipeline, 44)
    assert.equal(layout.getLayout().pipelineCollapsed, true)
  })
})
