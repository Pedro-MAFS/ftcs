import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isMoveIntoSelfOrChild,
  remapPathPrefix,
  remapPathSet,
  sanitizeEntryName,
} from './library-name.ts'

describe('sanitizeEntryName', () => {
  it('keeps Chinese and inner spaces', () => {
    assert.equal(sanitizeEntryName('  绿森 地板  '), '绿森 地板')
  })

  it('replaces illegal Windows characters', () => {
    assert.equal(sanitizeEntryName('a<>b:c'), 'a__b_c')
  })

  it('rejects empty, dots, and reserved names', () => {
    assert.equal(sanitizeEntryName('   '), '')
    assert.equal(sanitizeEntryName('.'), '')
    assert.equal(sanitizeEntryName('..'), '')
    assert.equal(sanitizeEntryName('CON'), '')
    assert.equal(sanitizeEntryName('nul.txt'), '')
  })
})

describe('path helpers', () => {
  it('remaps a node and its descendants', () => {
    assert.equal(remapPathPrefix('绿森/地板', '绿森', '客户A/绿森'), '客户A/绿森/地板')
    assert.equal(remapPathPrefix('绿森', '绿森', '客户A/绿森'), '客户A/绿森')
    assert.equal(remapPathPrefix('其它', '绿森', 'x'), '其它')
    assert.deepEqual(
      [...remapPathSet(['绿森', '绿森/a.md', 'x'], '绿森', 'B/绿森')].sort(),
      ['B/绿森', 'B/绿森/a.md', 'x'],
    )
  })

  it('detects moving a folder into itself or a child', () => {
    assert.equal(isMoveIntoSelfOrChild('绿森', '绿森'), true)
    assert.equal(isMoveIntoSelfOrChild('绿森', '绿森/地板'), true)
    assert.equal(isMoveIntoSelfOrChild('绿森', '客户A'), false)
    assert.equal(isMoveIntoSelfOrChild('a.md', ''), false)
  })
})
