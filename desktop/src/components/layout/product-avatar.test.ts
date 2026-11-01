import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { productAvatarGlyph } from './product-avatar.ts'

describe('productAvatarGlyph', () => {
  it('uses the first han character and keeps it', () => {
    assert.equal(productAvatarGlyph('华茂精密'), '华')
    assert.equal(productAvatarGlyph('北辰机电'), '北')
  })

  it('uppercases the first latin letter and skips leading space', () => {
    assert.equal(productAvatarGlyph('Acme Valves'), 'A')
    assert.equal(productAvatarGlyph('  acme'), 'A')
  })

  it('keeps a leading digit', () => {
    assert.equal(productAvatarGlyph('3M'), '3')
  })

  it('skips leading punctuation until a letter or han character', () => {
    assert.equal(productAvatarGlyph('—华茂'), '华')
    assert.equal(productAvatarGlyph('—acme'), 'A')
  })

  it('falls back when the name is empty or only symbols', () => {
    assert.equal(productAvatarGlyph(''), '产')
    assert.equal(productAvatarGlyph('   '), '产')
    assert.equal(productAvatarGlyph('***'), '产')
  })

  it('keeps kana and skips a leading emoji grapheme', () => {
    assert.equal(productAvatarGlyph('あいう'), 'あ')
    assert.equal(productAvatarGlyph('😀北辰'), '北')
  })
})
