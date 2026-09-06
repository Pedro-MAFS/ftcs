import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { NODE_PORTABLE_INSTALL } from './node-portable-install-types.ts'
import { verifyNodePortableZipSha256 } from './node-portable-download.ts'

describe('node-portable-download verifyNodePortableZipSha256', () => {
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
    const file = path.join(os.tmpdir(), `node-zip-bad-${Date.now()}.zip`)
    fs.writeFileSync(file, Buffer.from('not-the-official-zip'))
    tmpFiles.push(file)
    assert.equal(await verifyNodePortableZipSha256(file), false)
  })

  it('pins expected upstream sha256 constant', () => {
    assert.equal(NODE_PORTABLE_INSTALL.expectedZipBytes, 37_176_245)
  })
})
