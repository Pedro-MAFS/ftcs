import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatTaskDoneNotifyBody } from '../notify/task-done-notify-body'
import {
  formatExpandKeywordsDoneMessage,
  formatExpandKeywordsTargets,
} from './expand-keywords-targets'
import { getExploreIntensityLimitsFor } from './explore-intensity-logic'

describe('formatExpandKeywordsTargets', () => {
  it('三档目标与常量表一致，且不含旧的总数口径', () => {
    for (const intensity of ['low', 'medium', 'high'] as const) {
      const target = getExploreIntensityLimitsFor(intensity).keywordTargetPerRound
      const text = formatExpandKeywordsTargets(target, intensity)
      assert.match(text, new RegExp(`探索强度：${intensity}`))
      assert.match(text, new RegExp(`关键词目标 keyword_target_per_round：${target}`))
      assert.match(text, new RegExp(`R1 目标：${target} 条`))
      assert.match(text, new RegExp(`每个当前启用社媒各 ${target} 条`))
      assert.match(text, new RegExp(`R3 目标：${target} 条`))
      assert.match(text, /不设 search_queries 总数上限/)
      assert.match(text, /不要 round=R4/)
      assert.match(text, /允许少于目标/)
      assert.match(text, /禁止同义反复凑数/)
      assert.doesNotMatch(text, /30～50/)
      assert.doesNotMatch(text, /60%/)
      assert.doesNotMatch(text, /6～12/)
      assert.doesNotMatch(text, /至少 2/)
    }
  })

  it('低中高分别是 10 / 20 / 40', () => {
    assert.match(formatExpandKeywordsTargets(10, 'low'), /keyword_target_per_round：10/)
    assert.match(formatExpandKeywordsTargets(20, 'medium'), /keyword_target_per_round：20/)
    assert.match(formatExpandKeywordsTargets(40, 'high'), /keyword_target_per_round：40/)
  })
})

describe('formatExpandKeywordsDoneMessage', () => {
  it('摘要带档位目标，通知仍按实际条数解析', () => {
    const message = formatExpandKeywordsDoneMessage('prod_1', 12, 'medium', 20)
    assert.equal(message, '关键词已扩展：prod_1 · 12 条搜索词 · 按中档目标 20')
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'expand-keywords',
        ok: true,
        message,
      }),
      '关键词扩展已完成（12 条搜索词）',
    )
  })
})
