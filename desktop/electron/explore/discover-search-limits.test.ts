import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDiscoverSearchLimits } from './discover-search-limits'
import { getExploreIntensityLimitsFor } from './explore-intensity-logic'

describe('formatDiscoverSearchLimits', () => {
  it('三档 search_num_results 为 3 / 5 / 10，并写明补官网与官网打开', () => {
    const expected = { low: 3, medium: 5, high: 10 } as const
    for (const intensity of ['low', 'medium', 'high'] as const) {
      const searchNumResults = getExploreIntensityLimitsFor(intensity).searchNumResults
      assert.equal(searchNumResults, expected[intensity])
      const text = formatDiscoverSearchLimits(searchNumResults, intensity)
      assert.match(text, new RegExp(`探索强度：${intensity}`))
      assert.match(text, new RegExp(`search_num_results：${searchNumResults}`))
      assert.match(text, /所有 search_web/)
      assert.match(text, /floor\(本次主结果实际返回条数 × 0\.75\)/)
      assert.match(text, /已有官网的条目不消耗次数/)
      assert.match(text, /不要再用「每词 2 \/ 每轮 20」/)
      assert.match(text, /不设每词打开次数，也不设每轮打开次数/)
      assert.doesNotMatch(text, /每词最多 2、每轮最多 15/)
      assert.doesNotMatch(text, /pageSize/)
      assert.doesNotMatch(text, /place_details/)
    }
  })
})
