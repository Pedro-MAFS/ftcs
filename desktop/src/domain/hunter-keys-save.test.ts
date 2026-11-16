import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hunterApiKeysSaveField } from './hunter-keys-save.ts'

describe('hunter keys save field', () => {
  it('官方保存省略 hunterApiKeys，自定义原样提交', () => {
    assert.deepEqual(hunterApiKeysSaveField('official', ['k1', 'k2']), {})
    assert.deepEqual(hunterApiKeysSaveField('official', []), {})
    assert.deepEqual(hunterApiKeysSaveField('custom', ['k1', 'k2']), {
      hunterApiKeys: ['k1', 'k2'],
    })
    assert.deepEqual(hunterApiKeysSaveField('custom', []), { hunterApiKeys: [] })
  })
})
