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
      const limits = getExploreIntensityLimitsFor(intensity)
      const text = formatExpandKeywordsTargets(
        limits.keywordTargetR1,
        limits.keywordTargetPerRound,
        intensity,
      )
      assert.match(text, new RegExp(`探索强度：${intensity}`))
      assert.match(text, new RegExp(`R1 目标：${limits.keywordTargetR1} 条`))
      assert.match(text, new RegExp(`每个当前启用社媒各 ${limits.keywordTargetPerRound} 条`))
      assert.match(text, new RegExp(`R3 目标：${limits.keywordTargetPerRound} 条`))
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

  it('R1 低中高是 20 / 40 / 60，社媒与 R3 仍是 10 / 20 / 40', () => {
    assert.match(formatExpandKeywordsTargets(20, 10, 'low'), /R1 目标：20 条/)
    assert.match(formatExpandKeywordsTargets(20, 10, 'low'), /R3 目标：10 条/)
    assert.match(formatExpandKeywordsTargets(40, 20, 'medium'), /R1 目标：40 条/)
    assert.match(formatExpandKeywordsTargets(40, 20, 'medium'), /每个当前启用社媒各 20 条/)
    assert.match(formatExpandKeywordsTargets(60, 40, 'high'), /R1 目标：60 条/)
    assert.match(formatExpandKeywordsTargets(60, 40, 'high'), /R3 目标：40 条/)
  })
})

describe('formatExpandKeywordsDoneMessage', () => {
  it('摘要带档位目标，通知仍按实际条数解析', () => {
    const message = formatExpandKeywordsDoneMessage('prod_1', 12, 'medium', 40)
    assert.equal(message, '关键词已扩展：prod_1 · 12 条搜索词 · 按中档 R1 目标 40')
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
