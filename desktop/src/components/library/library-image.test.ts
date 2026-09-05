import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hasImageFiles, isImageFile, listImageFiles } from './library-image'

describe('library-image', () => {
  it('detects image extensions case-insensitively', () => {
    assert.equal(isImageFile('绿森/样品.JPG'), true)
    assert.equal(isImageFile('a/b.PNG'), true)
    assert.equal(isImageFile('x.webp'), true)
    assert.equal(isImageFile('说明.pdf'), false)
    assert.equal(isImageFile('说明.md'), false)
  })

  it('lists and detects mixed paths', () => {
    const paths = ['绿森/图.jpg', '绿森/readme.md', '绿森/宣传.PNG']
    assert.deepEqual(listImageFiles(paths), ['绿森/图.jpg', '绿森/宣传.PNG'])
    assert.equal(hasImageFiles(paths), true)
    assert.equal(hasImageFiles(['绿森/readme.md']), false)
  })
})
