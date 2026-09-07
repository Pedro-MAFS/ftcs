import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeGoogleProxyUrl,
  parseElectronProxyRule,
  parseGoogleProxyMode,
} from './google-proxy.ts'

describe('google-proxy', () => {
  it('parseGoogleProxyMode defaults to system', () => {
    assert.equal(parseGoogleProxyMode(undefined), 'system')
    assert.equal(parseGoogleProxyMode('manual'), 'manual')
    assert.equal(parseGoogleProxyMode('off'), 'off')
  })

  it('normalizeGoogleProxyUrl accepts host:port', () => {
    assert.equal(normalizeGoogleProxyUrl('127.0.0.1:7890'), 'http://127.0.0.1:7890')
    assert.equal(
      normalizeGoogleProxyUrl('socks5://127.0.0.1:7891'),
      'socks5://127.0.0.1:7891',
    )
  })

  it('parseElectronProxyRule handles PROXY and SOCKS', () => {
    assert.equal(
      parseElectronProxyRule('PROXY 127.0.0.1:7890'),
      'http://127.0.0.1:7890',
    )
    assert.equal(
      parseElectronProxyRule('SOCKS5 127.0.0.1:7891'),
      'socks5://127.0.0.1:7891',
    )
    assert.equal(parseElectronProxyRule('DIRECT'), null)
    assert.equal(
      parseElectronProxyRule('PROXY 127.0.0.1:7890; DIRECT'),
      'http://127.0.0.1:7890',
    )
  })
})
