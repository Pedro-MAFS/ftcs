import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { OPENCODE_BINARY_INSTALL } from './opencode-binary-install-types.ts'
import { verifyOpenCodeBinaryZipSha256 } from './opencode-binary-download.ts'

describe('opencode-binary-download verifyOpenCodeBinaryZipSha256', () => {
  const tmpFiles: string[] = []

  after(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
  })

  it('rejects mismatched sha256', async () => {
    const file = path.join(os.tmpdir(), `opencode-zip-bad-${Date.now()}.zip`)
    fs.writeFileSync(file, Buffer.from('not-the-official-zip'))
    tmpFiles.push(file)
    assert.equal(await verifyOpenCodeBinaryZipSha256(file), false)
  })

  it('pins expected upstream sha256 constant', () => {
    assert.equal(
      OPENCODE_BINARY_INSTALL.sha256Zip,
      '814dae5724dfa396a43b6408703d0929625483e2fac135623f10f0fa8db04a96',
    )
    assert.equal(OPENCODE_BINARY_INSTALL.expectedZipBytes, 59_388_435)
  })
})
