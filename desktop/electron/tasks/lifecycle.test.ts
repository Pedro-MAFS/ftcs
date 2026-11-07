import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskLifecycle, type Begin, type TaskRecord } from './lifecycle'
import { TaskJournal } from './journal'

const request: Begin = {
  protocol_version: 1,
  task_type: 'expand-keywords',
  request_id: 'a',
  scope: { product_id: 'p' },
  parameters: {},
}
test('one reservation, one preparation and one terminal across retries', async () => {
  const events: TaskRecord[] = []
  const lifecycle = new TaskLifecycle((record) => events.push(record))
  let prepares = 0
  const prepare = async () => {
    prepares++
    return { product_id: 'p' }
  }
  const first = lifecycle.begin('s', 'chat', request, prepare)
  const retry = lifecycle.begin('s', 'chat', request, prepare)
  await assert.rejects(lifecycle.begin('other', 'chat', request, prepare), /BUSY/)
  await assert.rejects(lifecycle.begin('s', 'chat', { ...request, scope: {} }, prepare), /CONFLICT/)
  const { task_id } = await first
  assert.equal((await retry).task_id, task_id)
  assert.equal(prepares, 1)
  const done = { task_id, outcome: 'succeeded' as const, message: '完成' }
  assert.throws(() => lifecycle.done('other', done, () => {}), /UNKNOWN_TASK/)
  lifecycle.done('s', done, () => {})
  lifecycle.done('s', done, () => assert.fail())
  assert.throws(() => lifecycle.done('s', { ...done, outcome: 'partial' }, () => {}), /CONFLICT/)
  assert.deepEqual(
    events.map((record) => record.state),
    ['preparing', 'running', 'succeeded'],
  )
})

test('cancelled preparation retains slot until cleanup and stays cancelled', async () => {
  const states: string[] = []
  const lifecycle = new TaskLifecycle((record) => states.push(record.state))
  let finish!: () => void
  const barrier = new Promise<void>((resolve) => {
    finish = resolve
  })
  const prepare = async () => {
    await barrier
    return { product_id: 'p' }
  }
  const started = lifecycle.begin('s', 'button', request, prepare)
  lifecycle.interrupt('s', 'cancelled', '用户中止')
  await assert.rejects(lifecycle.begin('other', 'chat', request, prepare), /BUSY/)
  finish()
  await assert.rejects(started)
  assert.deepEqual(states, ['preparing', 'cancelled'])
  assert.equal(lifecycle.current, undefined)
})
test('restart recovers an unfinished task once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ftcs-journal-'))
  try {
    const journal = new TaskJournal(dir)
    const lifecycle = new TaskLifecycle((record) => journal.record(record))
    await lifecycle.begin('s', 'button', request, async () => ({ product_id: 'p' }))
    const recovered = new TaskJournal(dir).snapshot()
    assert.equal(recovered[0].state, 'interrupted')
    assert.deepEqual(new TaskJournal(dir).snapshot(), recovered)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
