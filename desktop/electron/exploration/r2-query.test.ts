import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countEligibleR2Queries,
  exploreRunTitle,
  isEligibleR2Query,
} from './r2-query'

test('isEligibleR2Query requires round R2 and site_id', () => {
  assert.equal(
    isEligibleR2Query({ round: 'R2', site_id: 'linkedin_company' }),
    true,
  )
  assert.equal(isEligibleR2Query({ round: 'R2' }), false)
  assert.equal(
    isEligibleR2Query({ round: 'R1', site_id: 'linkedin_company' }),
    false,
  )
})

test('countEligibleR2Queries skips legacy R2 rows', () => {
  assert.equal(
    countEligibleR2Queries({
      search_queries: [
        { round: 'R2' },
        { round: 'R2', site_id: 'facebook_page' },
        { round: 'R1', site_id: 'linkedin_company' },
      ],
    }),
    1,
  )
})

test('exploreRunTitle names R1 and R2 for the task list', () => {
  assert.equal(exploreRunTitle(['R1']), 'R1 广撒网')
  assert.equal(exploreRunTitle(['R2']), 'R2 社媒发现')
  assert.equal(exploreRunTitle(['R3']), 'R3 规划中')
  assert.equal(exploreRunTitle(['R1', 'R2']), 'R1+R2')
})
