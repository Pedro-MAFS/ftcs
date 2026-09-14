import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { maskSecret } from '../config/env-file'
import {
  formatHunterKeysEnv,
  isHunterKeysMaskedInput,
  parseHunterApiKeysText,
  parseHunterVerifyEmails,
  readHunterKeysFromEnv,
  resolveHunterApiKeysSlots,
} from './hunter-keys'

describe('hunter-keys', () => {
  it('解析换行与逗号', () => {
    assert.deepEqual(parseHunterApiKeysText('a\nb,c\n a '), ['a', 'b', 'c'])
  })

  it('掩码判定', () => {
    assert.equal(isHunterKeysMaskedInput('abcd••••efgh'), true)
    assert.equal(isHunterKeysMaskedInput('real-key-value'), false)
    assert.equal(isHunterKeysMaskedInput('abcd••••1111\nxxxx••••2222'), true)
  })

  it('从 env 合并多 Key 与单 Key', () => {
    assert.deepEqual(
      readHunterKeysFromEnv({ HUNTER_API_KEYS: 'k1,k2', HUNTER_API_KEY: 'k3' }),
      ['k1', 'k2', 'k3'],
    )
    assert.deepEqual(
      readHunterKeysFromEnv({ HUNTER_API_KEYS: 'k1', HUNTER_API_KEY: 'k1' }),
      ['k1'],
    )
    assert.equal(formatHunterKeysEnv(['a', 'b']), 'a,b')
  })

  it('parseHunterVerifyEmails 默认 true', () => {
    assert.equal(parseHunterVerifyEmails(undefined), true)
    assert.equal(parseHunterVerifyEmails(''), true)
    assert.equal(parseHunterVerifyEmails('true'), true)
    assert.equal(parseHunterVerifyEmails('false'), false)
    assert.equal(parseHunterVerifyEmails('0'), false)
  })

  it('resolveHunterApiKeysSlots 可单独删除某一格', () => {
    const prev = ['alpha-key-1111', 'beta-key-2222', 'gamma-key-3333']
    const slots = [maskSecret(prev[0]!), maskSecret(prev[2]!)]
    assert.deepEqual(resolveHunterApiKeysSlots(slots, prev), [
      'alpha-key-1111',
      'gamma-key-3333',
    ])
  })

  it('resolveHunterApiKeysSlots 明文替换与新增', () => {
    const prev = ['alpha-key-1111']
    assert.deepEqual(
      resolveHunterApiKeysSlots([maskSecret(prev[0]!), 'brand-new-9999'], prev),
      ['alpha-key-1111', 'brand-new-9999'],
    )
    assert.deepEqual(resolveHunterApiKeysSlots([''], prev), [])
  })
})
