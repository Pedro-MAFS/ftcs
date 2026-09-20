import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatTaskDoneNotifyBody,
  taskLabelForNotify,
} from './task-done-notify-body'

describe('formatTaskDoneNotifyBody', () => {
  it('S1 产品画像', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'extract-product-profile',
        ok: true,
        message: '画像已生成：prod_1 · ready · 就绪度 80',
      }),
      '产品画像已生成',
    )
  })

  it('S2 关键词扩展带/不带数量', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'expand-keywords',
        ok: true,
        message: '关键词已扩展：prod_1 · 12 条搜索词',
      }),
      '关键词扩展已完成（12 条搜索词）',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'expand-keywords',
        ok: true,
        message: '关键词已扩展',
      }),
      '关键词扩展已完成',
    )
  })

  it('S3–S5 探索成功', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'discover-leads',
        ok: true,
        message: 'R1 广撒网完成：run_1 · 5 词 · 线索 3',
      }),
      'R1 广撒网已完成（线索 3）',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'discover-leads-r2',
        ok: true,
        message: 'R2 社媒发现完成：run_2 · 2 词 · 线索 1',
      }),
      'R2 社媒发现已完成（线索 1）',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'discover-leads-r3',
        ok: true,
        message: 'done',
      }),
      'R3 地图发现已完成',
    )
  })

  it('S6 评分去重', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'score-and-dedupe',
        ok: true,
        message: '评分去重完成：10 → 8 条 · A 2 / B 3 / C 3',
      }),
      '评分去重已完成（A 2 / B 3 / C 3）',
    )
  })

  it('S7/S8 补全联系人', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'enrich-lead-contacts',
        ok: true,
        message: '批量补全联系人完成：5 条',
      }),
      '批量补全联系人已完成',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'enrich-lead-contacts',
        ok: true,
        message: '补全联系人完成：lead_1',
      }),
      '补全联系人已完成',
    )
  })

  it('S9–S11 开发信', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: true,
        message: '邮件起草完成：7 封 · 目标 3 条',
      }),
      '开发信起草已完成（7 封）',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: true,
        message: '暂无待起草的已评分线索（可能已全部生成草稿）',
      }),
      '开发信：暂无待起草线索',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: true,
        message: '单槽起草完成：D:\\ws\\data\\emails\\lead\\draft.json',
      }),
      '开发信单人起草已完成',
    )
  })

  it('S12 中文对照 / S13 未知', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'translate-outreach-email',
        ok: true,
        message: '中文对照已写入：/tmp/draft.json',
      }),
      '中文对照已生成',
    )
    assert.equal(
      formatTaskDoneNotifyBody({ skill: '', ok: true, message: 'x' }),
      '任务已完成',
    )
  })

  it('中止文案', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'expand-keywords',
        ok: false,
        message: '用户中止了关键词扩展',
      }),
      '已中止：关键词扩展',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: false,
        message: '用户中止了单槽邮件起草',
      }),
      '已中止：开发信单人起草',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: false,
        message: '用户中止了邮件起草',
      }),
      '已中止：开发信起草',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: '',
        ok: false,
        message: '用户中止了任务',
      }),
      '已中止：任务',
    )
  })

  it('探索失败固定详见时间线', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'discover-leads',
        ok: false,
        message: 'R1 广撒网失败：run_xxx · 已执行 3 词 · 线索 0',
      }),
      '失败：R1 广撒网 · 详见应用内时间线',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'discover-leads-r3',
        ok: false,
        message: 'R3 未完成',
      }),
      '失败：R3 地图发现 · 详见应用内时间线',
    )
  })

  it('其它失败摘要与路径脱敏', () => {
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'enrich-lead-contacts',
        ok: false,
        message: '等待 OpenCode 会话 idle 超时',
      }),
      '失败：补全联系人 · 等待 OpenCode 会话 idle 超时',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'draft-outreach-email',
        ok: false,
        message: '写入失败 D:\\data\\emails\\x\\draft.json',
      }),
      '失败：开发信起草 · 详见应用内时间线',
    )
    assert.equal(
      formatTaskDoneNotifyBody({
        skill: 'score-and-dedupe',
        ok: false,
        message: '',
      }),
      '失败：评分去重 · 详见应用内时间线',
    )
  })

  it('taskLabelForNotify', () => {
    assert.equal(taskLabelForNotify('discover-leads-r2', ''), 'R2 社媒发现')
    assert.equal(
      taskLabelForNotify('draft-outreach-email', '单槽起草完成'),
      '开发信单人起草',
    )
  })
})
