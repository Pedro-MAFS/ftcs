import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { OPENCODE_BINARY_INSTALL } from './opencode-binary-install-types.ts'
import { isOpenCodePathUnderRuntimeDir } from './opencode-path-utils.ts'

describe('opencode-path-utils', () => {
  it('isOpenCodePathUnderRuntimeDir matches runtime root', () => {
    const runtime = path.join('C:', 'App', 'opencode-runtime')
    const exe = path.join(runtime, 'opencode.exe')
    assert.equal(isOpenCodePathUnderRuntimeDir(exe, runtime), true)
    assert.equal(
      isOpenCodePathUnderRuntimeDir('C:\\Program Files\\opencode\\opencode.exe', runtime),
      false,
    )
  })
})

describe('opencode-binary-install-types', () => {
  it('pins gitee url for v1.18.4', () => {
    assert.match(OPENCODE_BINARY_INSTALL.urlGitee, /opencodev1\.18\.4/)
    assert.equal(OPENCODE_BINARY_INSTALL.binaryFileName, 'opencode.exe')
  })
})
