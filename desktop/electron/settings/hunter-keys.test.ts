import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatHunterKeysEnv,
  isHunterKeysMaskedInput,
  parseHunterApiKeysText,
  readHunterKeysFromEnv,
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
})
