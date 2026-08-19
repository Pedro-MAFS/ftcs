import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { OFFICECLI_INSTALL } from './officecli-install-types.ts'
import { verifyOfficeCliSha256 } from './officecli-download.ts'

describe('officecli-download verifyOfficeCliSha256', () => {
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

  it('pins expected upstream sha256 for v1.0.144', () => {
    assert.equal(
      OFFICECLI_INSTALL.sha256WinX64,
      'e780cc6a5385f84b4d54d71b0c179904ed534125ec33fe39b1a8711fa80e387e',
    )
  })

  it('rejects mismatched sha256', async () => {
    const file = path.join(os.tmpdir(), `officecli-sha-bad-${Date.now()}.bin`)
    fs.writeFileSync(file, Buffer.from('not-the-official-binary'))
    tmpFiles.push(file)
    assert.equal(await verifyOfficeCliSha256(file), false)
  })
})
