import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { browserTabTitles } from './browser-tab-title.ts'

function title(tabs: Array<{ key: string; url: string }>, key: string): string {
  return browserTabTitles(tabs).get(key) ?? ''
}

describe('browserTabTitles', () => {
  it('uses the host without www when that host appears once', () => {
    const tabs = [
      { key: 'a', url: 'https://acme-industrial.com/products/valves' },
      { key: 'b', url: 'https://www.acme.com/' },
    ]
    assert.equal(title(tabs, 'a'), 'acme-industrial.com')
    assert.equal(title(tabs, 'b'), 'acme.com')
  })

  it('adds the first path segment when one host has two pages', () => {
    const tabs = [
      { key: 'a', url: 'https://acme-industrial.com/products/valves' },
      { key: 'b', url: 'https://acme-industrial.com/about' },
    ]
    assert.equal(title(tabs, 'a'), 'acme-industrial.com/products')
    assert.equal(title(tabs, 'b'), 'acme-industrial.com/about')
  })

  it('numbers later tabs when the first path segment is also the same', () => {
    const tabs = [
      { key: 'a', url: 'https://acme-industrial.com/products/valves' },
      { key: 'b', url: 'https://acme-industrial.com/products/pumps' },
    ]
    assert.equal(title(tabs, 'a'), 'acme-industrial.com/products')
    assert.equal(title(tabs, 'b'), 'acme-industrial.com/products ·2')
  })

  it('keeps a blank page labeled 浏览器', () => {
    const tabs = [
      { key: 'a', url: '' },
      { key: 'b', url: 'about:blank' },
    ]
    assert.equal(title(tabs, 'a'), '浏览器')
    assert.equal(title(tabs, 'b'), '浏览器')
  })
})
