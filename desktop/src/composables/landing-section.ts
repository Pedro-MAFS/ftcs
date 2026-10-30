import type { PipelineStep } from '../types/workspace'

/** 按左侧流水线完成态，从后往前选出本次进程的默认页。 */
export function landingSectionFromSteps(
  steps: PipelineStep[],
): 'input' | 'profile' | 'explore' | 'leads' {
  const done = (id: string) => steps.some((step) => step.id === id && step.status === 'done')
  if (done('explore') || done('score') || done('email')) return 'leads'
  if (done('keywords')) return 'explore'
  if (done('input')) return 'profile'
  return 'input'
}
