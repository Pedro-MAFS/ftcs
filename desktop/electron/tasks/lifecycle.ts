import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const skills = [
  'extract-product-profile',
  'expand-keywords',
  'discover-leads',
  'discover-leads-r2',
  'discover-leads-r3',
  'score-and-dedupe',
  'enrich-lead-contacts',
  'draft-outreach-email',
  'translate-outreach-email',
] as const
export type TaskSkill = (typeof skills)[number]
export type Outcome = 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'interrupted'
export type TaskState = Outcome | 'preparing' | 'running'
export interface Begin {
  protocol_version: 1
  request_id: string
  task_type: TaskSkill
  scope: { product_id?: string | null; lead_id?: string; recipient_key?: string }
  parameters: {
    library_sources?: string[]
    mode?: 'batch' | 'slot'
    lead_ids?: string[]
    verify_emails?: boolean
    max_queries?: number
    email?: string
  }
}
export interface TaskRecord {
  task_id: string
  session_id: string
  origin: 'chat' | 'button' | 'workflow' | 'schedule'
  task_type: TaskSkill
  scope: Begin['scope']
  state: TaskState
  revision: number
  started_at: string
  run_id?: string
  result?: Done['result']
  finished_at?: string
  message: string
}
export interface Done {
  task_id: string
  outcome: Exclude<Outcome, 'interrupted'>
  message: string
  result?: { run_id?: string; completed_count?: number; skipped_count?: number }
}
export function isActive(state: TaskState): boolean {
  return state === 'preparing' || state === 'running'
}
type Prepared = { product_id: string; [field: string]: unknown }
type Entry = {
  request: Begin
  record: TaskRecord
  controller: AbortController
  pending?: Promise<Prepared>
  done?: Done
}

/** One desktop workspace owns one execution slot. Reserve before awaiting I/O. */
export class TaskLifecycle {
  private entries = new Map<string, Entry>()
  private active?: Entry
  constructor(private readonly publish: (record: TaskRecord) => void) {}
  get current() {
    return this.active?.record
  }
  snapshot() {
    return Array.from(this.entries.values(), (entry) => structuredClone(entry.record))
  }

  async begin(
    session: string,
    origin: TaskRecord['origin'],
    request: Begin,
    prepare: (signal: AbortSignal) => Promise<Prepared>,
    taskId = randomUUID(),
  ) {
    const key = `${session}/${request.request_id}`
    let entry = this.entries.get(key)
    if (entry) {
      if (!isDeepStrictEqual(request, entry.request)) throw new Error('REQUEST_CONFLICT')
      if (!isActive(entry.record.state)) return { ...entry.record }
    } else {
      if (this.active) throw new Error('BUSY')
      entry = {
        request: structuredClone(request),
        controller: new AbortController(),
        record: {
          task_id: taskId,
          session_id: session,
          origin,
          task_type: request.task_type,
          scope: { ...request.scope },
          state: 'preparing',
          revision: 1,
          started_at: new Date().toISOString(),
          message: '准备中',
        },
      }
      const owner = entry
      this.active = owner
      this.entries.set(key, owner)
      if (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value!)
      this.publish(structuredClone(owner.record))
      owner.pending = Promise.resolve()
        .then(() => prepare(owner.controller.signal))
        .then((prepared) => {
          owner.controller.signal.throwIfAborted()
          owner.record.scope.product_id = prepared.product_id
          this.transition(owner, 'running', '执行中')
          return prepared
        })
        .catch((error) => {
          if (this.active === owner && isActive(owner.record.state))
            this.transition(owner, 'failed', error instanceof Error ? error.message : '准备失败')
          throw error
        })
        .finally(() => {
          if (!isActive(owner.record.state) && this.active === owner) this.active = undefined
        })
    }
    const prepared = await entry.pending
    return { ...entry.record, prepared }
  }

  bindProduct(productId: string) {
    const entry = this.active
    if (!entry || entry.record.state !== 'preparing') return
    entry.record.scope.product_id = productId
    entry.record.revision++
    this.publish(structuredClone(entry.record))
  }

  bindExploration(runId: string) {
    const entry = this.active
    if (!entry || entry.record.state !== 'running') return
    entry.record.run_id = runId
    entry.record.revision++
    this.publish(structuredClone(entry.record))
  }

  done(session: string, request: Done, verify: (record: TaskRecord, result: Done) => void) {
    const entry = [...this.entries.values()].find((e) => e.record.task_id === request.task_id)
    if (!entry || entry.record.session_id !== session) throw new Error('UNKNOWN_TASK')
    if (entry.done) {
      if (!isDeepStrictEqual(entry.done, request)) throw new Error('TERMINAL_CONFLICT')
      return { ...entry.record }
    }
    if (entry.record.state !== 'running') throw new Error('TASK_NOT_RUNNING')
    entry.done = structuredClone(request)
    try {
      if (request.outcome === 'succeeded' || request.outcome === 'partial') verify(entry.record, request)
      entry.record.result = request.result
      this.transition(entry, request.outcome, request.message)
    } catch (error) {
      this.transition(entry, 'failed', error instanceof Error ? error.message : '产物校验失败')
    }
    entry.pending = undefined
    this.active = undefined
    return { ...entry.record }
  }

  interrupt(session: string, state: 'interrupted' | 'cancelled', reason: string) {
    const entry = this.active
    if (!entry || entry.record.session_id !== session || !isActive(entry.record.state)) return
    const preparing = entry.record.state === 'preparing'
    entry.controller.abort(new Error(reason))
    this.transition(entry, state, reason)
    if (!preparing) {
      entry.pending = undefined
      this.active = undefined
    }
  }

  private transition(entry: Entry, state: TaskState, message: string) {
    entry.record.state = state
    entry.record.message = message.slice(0, 500)
    entry.record.revision++
    if (!isActive(state)) entry.record.finished_at = new Date().toISOString()
    this.publish(structuredClone(entry.record))
  }
}
