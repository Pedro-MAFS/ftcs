import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LAYOUT_RATIOS,
  defaultMainViewLayout,
  storedMainViewLayout,
  writableMainViewLayout,
} from './main-view-layout.ts'

const ratios = { pipeline: 0.3, main: 0.4, agent: 0.3 }

describe('main view layout prefs', () => {
  it('uses the US-LY-01 default ratios', () => {
    assert.deepEqual(DEFAULT_LAYOUT_RATIOS, { pipeline: 0.2107, main: 0.4857, agent: 0.3036 })
  })

  it('returns null when the field is missing', () => {
    assert.equal(storedMainViewLayout(undefined), null)
    assert.equal(storedMainViewLayout(null), null)
  })

  it('keeps a valid collapsed layout and a filled snapshot', () => {
    const collapsed = {
      ratios,
      pipelineCollapsed: true,
      agentCollapsed: false,
      fill: 'none',
      beforeFill: null,
    }
    assert.deepEqual(storedMainViewLayout(collapsed), collapsed)

    const filled = {
      ratios,
      pipelineCollapsed: false,
      agentCollapsed: true,
      fill: 'agent',
      beforeFill: {
        ratios,
        pipelineCollapsed: false,
        agentCollapsed: true,
      },
    }
    assert.deepEqual(writableMainViewLayout(filled), filled)
  })

  it('rejects ratios that are not finite positive numbers summing to 1', () => {
    assert.equal(writableMainViewLayout({ ...open(), ratios: { pipeline: 0, main: 0.5, agent: 0.5 } }), null)
    assert.equal(
      writableMainViewLayout({ ...open(), ratios: { pipeline: Number.NaN, main: 0.5, agent: 0.5 } }),
      null,
    )
    assert.equal(
      storedMainViewLayout({ ...open(), ratios: { pipeline: 0.2, main: 0.2, agent: 0.2 } }),
      null,
    )
  })

  it('rejects fill none when a snapshot is still attached', () => {
    assert.equal(
      writableMainViewLayout({
        ...open(),
        beforeFill: { ratios, pipelineCollapsed: false, agentCollapsed: false },
      }),
      null,
    )
  })

  it('does not reopen a filled layout whose snapshot is damaged', () => {
    const damaged = {
      ratios,
      pipelineCollapsed: true,
      agentCollapsed: true,
      fill: 'main',
      beforeFill: { ratios: { pipeline: 2, main: 2, agent: 2 } },
    }
    assert.equal(writableMainViewLayout(damaged), null)
    assert.deepEqual(storedMainViewLayout(damaged), defaultMainViewLayout())
  })
})

function open() {
  return {
    ratios,
    pipelineCollapsed: false,
    agentCollapsed: false,
    fill: 'none' as const,
    beforeFill: null,
  }
}
