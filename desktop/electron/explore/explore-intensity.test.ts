import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  floorThreeQuarters,
  getExploreIntensityLimitsFor,
  resolveExploreIntensity,
} from './explore-intensity-logic'

describe('explore-intensity-logic', () => {
  it('resolve：缺省与非法为 medium', () => {
    assert.equal(resolveExploreIntensity(undefined), 'medium')
    assert.equal(resolveExploreIntensity(null), 'medium')
    assert.equal(resolveExploreIntensity('foo'), 'medium')
    assert.equal(resolveExploreIntensity(1), 'medium')
    assert.equal(resolveExploreIntensity('LOW'), 'medium')
    assert.equal(resolveExploreIntensity('low'), 'low')
    assert.equal(resolveExploreIntensity('medium'), 'medium')
    assert.equal(resolveExploreIntensity('high'), 'high')
  })

  it('limits：三档数字表', () => {
    assert.deepEqual(getExploreIntensityLimitsFor('low'), {
      keywordTargetPerRound: 10,
      searchNumResults: 3,
      placesResultLimit: 10,
      threeQuartersRatio: 0.75,
    })
    assert.deepEqual(getExploreIntensityLimitsFor('medium'), {
      keywordTargetPerRound: 20,
      searchNumResults: 5,
      placesResultLimit: 20,
      threeQuartersRatio: 0.75,
    })
    assert.deepEqual(getExploreIntensityLimitsFor('high'), {
      keywordTargetPerRound: 40,
      searchNumResults: 10,
      placesResultLimit: 40,
      threeQuartersRatio: 0.75,
    })
  })

  it('floorThreeQuarters：满页与边界', () => {
    assert.equal(floorThreeQuarters(10), 7)
    assert.equal(floorThreeQuarters(20), 15)
    assert.equal(floorThreeQuarters(40), 30)
    assert.equal(floorThreeQuarters(5), 3)
    assert.equal(floorThreeQuarters(3), 2)
    assert.equal(floorThreeQuarters(0), 0)
    assert.equal(floorThreeQuarters(-1), 0)
    assert.equal(floorThreeQuarters(Number.NaN), 0)
  })
})
