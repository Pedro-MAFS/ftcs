import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PipelineStep, PipelineStepId, PipelineStepStatus } from '../types/workspace'
import { landingSectionFromSteps } from './landing-section.ts'

function steps(status: Partial<Record<PipelineStepId, PipelineStepStatus>>): PipelineStep[] {
  const ids: PipelineStepId[] = ['input', 'keywords', 'explore', 'score', 'email']
  return ids.map((id) => ({
    id,
    label: id,
    status: status[id] ?? 'pending',
    statusLabel: '',
  }))
}

describe('landingSectionFromSteps', () => {
  it('opens input when every step is pending', () => {
    assert.equal(landingSectionFromSteps(steps({})), 'input')
  })

  it('opens profile when only input is done', () => {
    assert.equal(landingSectionFromSteps(steps({ input: 'done' })), 'profile')
  })

  it('does not advance while input is running', () => {
    assert.equal(landingSectionFromSteps(steps({ input: 'running' })), 'input')
  })

  it('stays on profile when keywords are running and later steps are unfinished', () => {
    assert.equal(
      landingSectionFromSteps(steps({ input: 'done', keywords: 'running' })),
      'profile',
    )
  })

  it('opens explore when keywords are done and later steps are not', () => {
    assert.equal(
      landingSectionFromSteps(steps({ input: 'done', keywords: 'done' })),
      'explore',
    )
  })

  it('opens leads when explore, score, or email is done', () => {
    assert.equal(landingSectionFromSteps(steps({ explore: 'done' })), 'leads')
    assert.equal(landingSectionFromSteps(steps({ score: 'done' })), 'leads')
    assert.equal(landingSectionFromSteps(steps({ email: 'done' })), 'leads')
    assert.equal(
      landingSectionFromSteps(
        steps({
          input: 'done',
          keywords: 'done',
          explore: 'done',
          score: 'done',
          email: 'done',
        }),
      ),
      'leads',
    )
  })
})
