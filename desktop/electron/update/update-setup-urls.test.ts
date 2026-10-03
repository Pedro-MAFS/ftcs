import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultSetupUrls,
  installerCommand,
  parseSetupSha256,
  resolveSetupDownloadUrls,
  setupInstallerFileName,
} from './update-setup-urls.ts'

describe('setup download urls', () => {
  it('uses Gitee first and GitHub as fallback for the current manifest shape', () => {
    const urls = defaultSetupUrls('0.5.7')
    assert.equal(
      urls.primary,
      'https://gitee.com/mfs1998_admin/ftcs/releases/download/V0.5.7/%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Setup-0.5.7.exe',
    )
    assert.equal(
      urls.fallback,
      'https://github.com/Pedro-MAFS/ftcs/releases/download/0.5.7/foreign-trade-Setup-0.5.7.exe',
    )
    assert.equal(setupInstallerFileName(' 0.5.7 '), '外贸获客-Setup-0.5.7.exe')
  })

  it('prefers manifest urls when present', () => {
    const urls = resolveSetupDownloadUrls('1.2.3', {
      setupUrl: ' https://example.com/a.exe ',
      setupUrlFallback: ' https://example.com/b.exe ',
    })
    assert.deepEqual(urls, {
      primary: 'https://example.com/a.exe',
      fallback: 'https://example.com/b.exe',
    })
  })

  it('keeps default urls when manifest fields are blank', () => {
    const urls = resolveSetupDownloadUrls('1.0.0', {
      setupUrl: '  ',
      setupUrlFallback: '',
    })
    assert.equal(urls.primary, defaultSetupUrls('1.0.0').primary)
    assert.equal(urls.fallback, defaultSetupUrls('1.0.0').fallback)
  })

  it('spawns the NSIS wizard with no silent arguments', () => {
    const command = installerCommand('C:\\Updates\\外贸获客-Setup-1.2.3.exe')
    assert.deepEqual([...command.args], [])
    assert.equal(command.command, 'C:\\Updates\\外贸获客-Setup-1.2.3.exe')
  })

  it('parses optional sha256', () => {
    assert.deepEqual(parseSetupSha256(undefined), { kind: 'skip' })
    assert.deepEqual(parseSetupSha256('  '), { kind: 'skip' })
    assert.equal(parseSetupSha256('abc').kind, 'invalid')
    assert.deepEqual(parseSetupSha256('A'.repeat(64)), {
      kind: 'check',
      hex: 'a'.repeat(64),
    })
  })
})
