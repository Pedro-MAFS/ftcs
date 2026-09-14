import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCompanyDomain } from './parse-company-domain'

describe('parseCompanyDomain', () => {
  it('解析常见 URL', () => {
    assert.equal(parseCompanyDomain('https://www.pantron.com/about'), 'pantron.com')
    assert.equal(parseCompanyDomain('http://pantron.com'), 'pantron.com')
    assert.equal(parseCompanyDomain('pantron.com'), 'pantron.com')
    assert.equal(parseCompanyDomain('https://shop.example.co.uk/path'), 'shop.example.co.uk')
  })

  it('垃圾输入返回 null', () => {
    assert.equal(parseCompanyDomain(''), null)
    assert.equal(parseCompanyDomain('not a url'), null)
    assert.equal(parseCompanyDomain('localhost'), null)
  })
})
