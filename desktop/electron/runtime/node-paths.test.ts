import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { NODE_PORTABLE_INSTALL } from './node-portable-install-types.ts'
import { isNodePathUnderRuntimeDir } from './node-path-utils.ts'

describe('node-path-utils', () => {
  it('isNodePathUnderRuntimeDir matches runtime root', () => {
    const runtime = path.join('C:', 'App', 'node-runtime')
    const exe = path.join(runtime, 'node.exe')
    assert.equal(isNodePathUnderRuntimeDir(exe, runtime), true)
    assert.equal(
      isNodePathUnderRuntimeDir('C:\\Program Files\\nodejs\\node.exe', runtime),
      false,
    )
  })
})

describe('node-portable-install-types', () => {
  it('pins official sha256 and gitee url for v24.18.0', () => {
    assert.equal(
      NODE_PORTABLE_INSTALL.sha256Zip,
      '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821',
    )
    assert.match(NODE_PORTABLE_INSTALL.urlGitee, /nodev24\.18\.0/)
  })
})
