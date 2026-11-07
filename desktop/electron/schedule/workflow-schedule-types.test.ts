import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeLastDueAt,
  isDueNow,
  isValidTimeLocal,
  slotKey,
} from './workflow-schedule-types.ts'

describe('workflow-schedule-types', () => {
  it('validates timeLocal', () => {
    assert.equal(isValidTimeLocal('09:00'), true)
    assert.equal(isValidTimeLocal('23:59'), true)
    assert.equal(isValidTimeLocal('9:00'), false)
    assert.equal(isValidTimeLocal('24:00'), false)
  })

  it('daily last due is today when past time', () => {
    const now = new Date(2026, 8, 20, 10, 30, 0) // Sep 20 2026 local
    const due = computeLastDueAt(
      { enabled: true, recurrence: 'daily', weekday: null, timeLocal: '09:00' },
      now,
    )
    assert.ok(due)
    assert.equal(due!.getHours(), 9)
    assert.equal(due!.getDate(), 20)
  })

  it('isDueNow within grace and respects lastRunAt', () => {
    const now = new Date(2026, 8, 20, 9, 0, 30)
    const base = {
      id: 'sch_1',
      productId: 'p',
      planId: 'plan',
      enabled: true,
      recurrence: 'daily' as const,
      weekday: null,
      timeLocal: '09:00',
      createdAt: '',
      updatedAt: '',
    }
    assert.equal(isDueNow({ ...base, lastRunAt: null }, now), true)
    assert.equal(
      isDueNow({ ...base, lastRunAt: new Date(2026, 8, 20, 9, 0, 0).toISOString() }, now),
      false,
    )
  })

  it('does not run a missed schedule outside its scheduled minute', () => {
    const base = {
      id: 'sch_1',
      productId: 'p',
      planId: 'plan',
      enabled: true,
      recurrence: 'daily' as const,
      weekday: null,
      timeLocal: '23:05',
      createdAt: '',
      updatedAt: '',
      lastRunAt: null,
    }
    assert.equal(isDueNow(base, new Date(2026, 8, 20, 9, 0, 0)), false)
    assert.equal(isDueNow(base, new Date(2026, 8, 20, 23, 5, 30)), true)
    assert.equal(isDueNow(base, new Date(2026, 8, 20, 23, 6, 0)), false)
  })

  it('slotKey stable', () => {
    const d = new Date(2026, 8, 20, 9, 0, 0)
    assert.equal(slotKey('sch_1', d), 'sch_1|2026-09-20|09:00')
  })
})
