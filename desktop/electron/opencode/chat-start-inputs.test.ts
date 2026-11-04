import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { resolveChatProfileSources, assertChatIdentifier, validateChatTranslation } from './chat-start-inputs'
import { parseChatStartAnswers, preflightKindFor } from './chat-start-task'

const parse = (skill: string, headers: string[], answers: string[][]) =>
  parseChatStartAnswers(headers.map(header => ({ header })), answers, skill)

it('画像必须有真实资料选择，允许多选，拒绝裸产品和跨步骤题头', () => {
  assert.deepEqual(parse('extract-product-profile', ['产品', '资料'], [['新建'], ['a.md', 'b.txt']]),
    { ok: true, stage: 'profile', product_id: '新建', sources: ['a.md', 'b.txt'] })
  assert.deepEqual(parse('extract-product-profile', ['产品'], [['新建']]), { ok: false, code: 'missing_sources' })
  assert.deepEqual(parse('extract-product-profile', ['产品', '资料'], [['prod_old'], ['a.md']]), { ok: false, code: 'bad_stage' })
  assert.deepEqual(parse('extract-product-profile', ['产品', '线索'], [['新建'], ['lead']]), { ok: false, code: 'bad_stage' })
  assert.equal(preflightKindFor({ ok: true, stage: 'profile', product_id: '新建' }), 'extract-profile')
})

it('翻译默认公司槽，个人槽准确传递，缺线索/多选/阶段不符不可启动', () => {
  assert.deepEqual(parse('translate-outreach-email', ['产品', '线索'], [['p'], ['l']]),
    { ok: true, stage: 'translate', product_id: 'p', lead_id: 'l', recipient_key: 'company' })
  assert.deepEqual(parse('translate-outreach-email', ['产品', '线索', '收件槽'], [['p'], ['l'], ['a_at_b.com']]),
    { ok: true, stage: 'translate', product_id: 'p', lead_id: 'l', recipient_key: 'a_at_b.com' })
  assert.deepEqual(parse('translate-outreach-email', ['产品'], [['p']]), { ok: false, code: 'missing_lead' })
  assert.deepEqual(parse('translate-outreach-email', ['产品', '线索'], [['p'], ['l', 'l2']]), { ok: false, code: 'bad_stage' })
  assert.deepEqual(parse('translate-outreach-email', ['产品', '线索', '阶段'], [['p'], ['l'], ['email']]), { ok: false, code: 'bad_stage' })
})

it('资料混选分流、中文路径、失效/越界/符号链接拒绝', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs141-inputs-'))
  const files = path.join(root, 'data/library/files')
  fs.mkdirSync(files, { recursive: true })
  fs.writeFileSync(path.join(files, '官网.md'), '---\ntype: website\nurl: https://example.com\n---\n', 'utf8')
  fs.writeFileSync(path.join(files, '说明.txt'), '产品资料', 'utf8')
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside', 'utf8')
  try {
    assert.deepEqual(resolveChatProfileSources(['官网.md', '说明.txt', '说明.txt'], root),
      { websitePaths: ['官网.md'], filePaths: ['说明.txt'] })
    for (const bad of ['../outside.txt', '/etc/passwd', 'C:/outside.txt', 'missing.txt', '.']) {
      assert.throws(() => resolveChatProfileSources([bad], root))
    }
    fs.symlinkSync(path.join(root, 'outside.txt'), path.join(files, 'link.txt'))
    assert.throws(() => resolveChatProfileSources(['link.txt'], root))
    for (const key of ['company', 'jane.doe+sales_at_example.com']) assert.doesNotThrow(() => assertChatIdentifier(key))
    for (const key of ['..', '../lead', '/tmp', 'a/b', 'a\\b']) assert.throws(() => assertChatIdentifier(key))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

it('翻译启动只读校验归属和外文内容，拒绝外部草稿链接', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs141-drafts-'))
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs141-external-'))
  const dir = path.join(root, 'data/emails/lead')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'draft.json')
  const good = JSON.stringify({ product_id: 'prod', subject: 'Hello', body: 'Body' })
  try {
    fs.writeFileSync(file, good)
    validateChatTranslation('prod', 'lead', 'company', root)
    assert.throws(() => validateChatTranslation('other', 'lead', 'company', root))
    assert.equal(fs.readFileSync(file, 'utf8'), good)
    fs.writeFileSync(file, JSON.stringify({ product_id: 'prod', subject: 'Hello', body: '' }))
    assert.throws(() => validateChatTranslation('prod', 'lead', 'company', root))
    fs.unlinkSync(file)
    fs.writeFileSync(path.join(external, 'draft.json'), good)
    fs.symlinkSync(path.join(external, 'draft.json'), file)
    assert.throws(() => validateChatTranslation('prod', 'lead', 'company', root))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(external, { recursive: true, force: true })
  }
})
