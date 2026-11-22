import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitQuotedText } from './reply-quote'

test('折叠尾部引文，保留签名、穿插回复和缺少邮件头的普通分隔线', () => {
  const reply = '回复下\n发自我的 iPhone'
  for (const quote of [
    '---------- 原始邮件 ----------\n发件人：小马\n发送时间：昨天\n收件人：我\n主题：测试\n测试下',
    'On Tuesday, Alice wrote:\n> hello\n>> earlier',
  ])
    assert.deepEqual(splitQuotedText(reply + '\n' + quote), { body: reply, quote })
  for (const body of ['> first\nanswer\n> second', '--- 原始邮件 ---\n这个是我的备注', '普通正文'])
    assert.deepEqual(splitQuotedText(body), { body })
})
