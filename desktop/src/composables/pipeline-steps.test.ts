import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derivePipelineSteps, pendingPipelineSteps } from './pipeline-steps.ts'

describe('derivePipelineSteps', () => {
  it('returns all pending when no profile context', () => {
    assert.deepEqual(pendingPipelineSteps().map((s) => s.status), [
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('marks score and email done from disk counts, not agent session', () => {
    const steps = derivePipelineSteps({
      profileReady: true,
      hasKeywords: true,
      hasExploreCompleted: true,
      hasExploreRunning: false,
      scoredCount: 12,
      emailDraftCount: 3,
      generatingProfile: false,
      expandingKeywords: false,
      exploring: false,
      scoring: false,
      drafting: false,
    })
    assert.equal(steps.find((s) => s.id === 'score')?.status, 'done')
    assert.equal(steps.find((s) => s.id === 'email')?.status, 'done')
  })

  it('keeps score done from disk after navigate away from leads page', () => {
    const steps = derivePipelineSteps({
      profileReady: true,
      hasKeywords: true,
      hasExploreCompleted: true,
      hasExploreRunning: false,
      scoredCount: 12,
      emailDraftCount: 0,
      generatingProfile: false,
      expandingKeywords: false,
      exploring: true,
      scoring: false,
      drafting: false,
    })
    assert.equal(steps.find((s) => s.id === 'score')?.status, 'done')
    assert.equal(steps.find((s) => s.id === 'explore')?.status, 'done')
  })

  it('shows explore running from agent while no completed run on disk', () => {
    const steps = derivePipelineSteps({
      profileReady: true,
      hasKeywords: true,
      hasExploreCompleted: false,
      hasExploreRunning: false,
      scoredCount: 0,
      emailDraftCount: 0,
      generatingProfile: false,
      expandingKeywords: false,
      exploring: true,
      scoring: false,
      drafting: false,
    })
    assert.equal(steps.find((s) => s.id === 'explore')?.status, 'running')
  })

  it('shows profile generation as running on step 1', () => {
    const steps = derivePipelineSteps({
      profileReady: false,
      hasKeywords: false,
      hasExploreCompleted: false,
      hasExploreRunning: false,
      scoredCount: 0,
      emailDraftCount: 0,
      generatingProfile: true,
      expandingKeywords: false,
      exploring: false,
      scoring: false,
      drafting: false,
    })
    assert.equal(steps.find((s) => s.id === 'input')?.status, 'running')
  })

  it('routes keywords step label to 可执行 only when profile ready', () => {
    const steps = derivePipelineSteps({
      profileReady: true,
      hasKeywords: false,
      hasExploreCompleted: false,
      hasExploreRunning: false,
      scoredCount: 0,
      emailDraftCount: 0,
      generatingProfile: false,
      expandingKeywords: false,
      exploring: false,
      scoring: false,
      drafting: false,
    })
    assert.equal(steps.find((s) => s.id === 'keywords')?.statusLabel, '可执行')
  })
})
