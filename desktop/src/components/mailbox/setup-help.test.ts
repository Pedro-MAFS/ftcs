import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mailProvider, mailSetupQuestion } from './setup-help'

test('邮箱配置提问支持服务商名称、自有域名和完整地址', () => {
  for (const name of ['QQ', 'Google Workspace', '网易企业邮箱', 'company.example'])
    assert.equal(mailProvider('  ' + name + '  '), name)
  const provider = mailProvider('  Buyer+office@Mail.Company.Example  ')
  assert.equal(provider, 'mail.company.example')
  assert.match(mailSetupQuestion(provider), /mail\.company\.example/)
  assert.doesNotMatch(mailSetupQuestion(provider), /Buyer|office/i)
  for (const invalid of [' ', 'name@', 'name@@company.example', 'name@company.example/path'])
    assert.equal(mailProvider(invalid), '')
})
