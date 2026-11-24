import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CREDENTIAL_LABEL, mailProvider, mailSetupQuestion } from './setup-help'

test('邮箱配置提问支持服务商名称、自有域名和完整地址', () => {
  for (const name of ['QQ', 'Google Workspace', '网易企业邮箱', 'company.example'])
    assert.equal(mailProvider('  ' + name + '  '), name)
  const provider = mailProvider('  Buyer+office@Mail.Company.Example  ')
  assert.equal(provider, 'mail.company.example')
  assert.match(mailSetupQuestion(provider, 'dev@example.com'), /mail\.company\.example/)
  assert.doesNotMatch(mailSetupQuestion(provider, 'dev@example.com'), /Buyer|office/i)
  for (const invalid of [' ', 'name@', 'name@@company.example', 'name@company.example/path'])
    assert.equal(mailProvider(invalid), '')
})

test('提问要求模型先判断登录方式，再按三类分支回答', () => {
  const question = mailSetupQuestion('outlook.com', 'dev@example.com')
  assert.match(question, /先判断这个邮箱能用哪种方式登录/)
  // 仅支持 OAuth：Google 指路 Google 授权，其余说明暂不支持
  assert.match(question, /「Google 授权」按钮/)
  assert.match(question, /暂不支持/)
  // 支持授权码：给出获取步骤
  assert.match(question, /如何生成授权码或应用专用密码/)
  // 不确定：先试密码，再联系开发者
  assert.match(question, /判断不准/)
  assert.match(question, /dev@example\.com/)
  assert.match(question, /不要凭空编造获取入口/)
})

test('提问只使用一个凭据栏名称，且不索要密码', () => {
  const question = mailSetupQuestion('qq.com', 'dev@example.com')
  assert.ok(question.includes(`「${CREDENTIAL_LABEL}」`))
  assert.equal(CREDENTIAL_LABEL, '授权码或邮箱密码')
  assert.match(question, /请不要让我在聊天中提供密码或授权码/)
})

test('未提供联系方式时不留下空的开发者提示', () => {
  const question = mailSetupQuestion('company.example')
  assert.match(question, /联系开发者/)
  assert.doesNotMatch(question, /undefined/)
  assert.doesNotMatch(question, /@\s/)
})
