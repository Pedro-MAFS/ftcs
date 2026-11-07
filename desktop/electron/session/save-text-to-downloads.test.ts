import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { saveTextToDownloads } from './save-text-to-downloads'

const NAME = 'ftcs-session-20261101-153045.txt'

describe('saveTextToDownloads', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  async function tempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ftcs-session-'))
    dirs.push(dir)
    return dir
  }

  it('writes the full utf-8 text without a BOM and returns the absolute path', async () => {
    const dir = await tempDir()
    const content = `全文\n绿森塑木\n${'A'.repeat(200_001)}`
    const result = await saveTextToDownloads(dir, { suggestedName: NAME, content })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(path.isAbsolute(result.path), true)
    assert.equal(result.path, path.join(dir, NAME))
    const buf = await fs.readFile(result.path)
    assert.equal(buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false)
    assert.equal(buf.toString('utf8'), content)
    assert.equal(buf.toString('utf8').length, content.length)
    assert.equal(buf.toString('utf8').includes('已截断'), false)
  })

  it('appends -1 and -2 instead of overwriting an existing file', async () => {
    const dir = await tempDir()
    const first = path.join(dir, NAME)
    const second = path.join(dir, 'ftcs-session-20261101-153045-1.txt')
    await fs.writeFile(first, 'keep-0', 'utf8')
    await fs.writeFile(second, 'keep-1', 'utf8')
    const content = '新的全文'
    const result = await saveTextToDownloads(dir, { suggestedName: NAME, content })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(path.basename(result.path), 'ftcs-session-20261101-153045-2.txt')
    assert.equal(await fs.readFile(first, 'utf8'), 'keep-0')
    assert.equal(await fs.readFile(second, 'utf8'), 'keep-1')
    assert.equal(await fs.readFile(result.path, 'utf8'), content)
  })

  it('rejects a name that is not a single txt file', async () => {
    const dir = await tempDir()
    const names = [
      '',
      '.',
      '..',
      'foo/bar.txt',
      'foo\\bar.txt',
      '../x.txt',
      'foo..txt',
      'foo.TXT',
      '/tmp/foo.txt',
      'C:\\Users\\me\\Downloads\\a.txt',
    ]
    for (const suggestedName of names) {
      const result = await saveTextToDownloads(dir, { suggestedName, content: 'x' })
      assert.deepEqual(result, { ok: false, error: '文件名无效' })
    }
    assert.deepEqual(await fs.readdir(dir), [])
    const missing = await saveTextToDownloads(dir, undefined)
    assert.deepEqual(missing, { ok: false, error: '文件名无效' })
  })

  it('rejects a non-string content', async () => {
    const dir = await tempDir()
    const result = await saveTextToDownloads(dir, {
      suggestedName: NAME,
      content: 1 as unknown as string,
    })
    assert.deepEqual(result, { ok: false, error: '内容无效' })
    assert.deepEqual(await fs.readdir(dir), [])
  })

  it('returns a one-line reason when the directory cannot be written', async () => {
    const dir = await tempDir()
    const missing = path.join(dir, 'missing')
    const result = await saveTextToDownloads(missing, { suggestedName: NAME, content: '全文' })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error.includes('\n'), false)
    assert.ok(result.error.length > 0)
    assert.ok(result.error.length <= 120)
    assert.equal(await fs.readdir(dir).then((names) => names.includes(NAME)), false)
  })

  it('deletes the new file when the write fails and does not touch the existing one', async () => {
    const dir = await tempDir()
    const existing = path.join(dir, NAME)
    await fs.writeFile(existing, 'keep', 'utf8')
    const probePath = path.join(dir, '.probe')
    const probe = await fs.open(probePath, 'w')
    const proto = Object.getPrototypeOf(probe) as { writeFile: () => Promise<void> }
    await probe.close()
    await fs.unlink(probePath)
    const original = proto.writeFile
    const reason = `${'E'.repeat(150)}\nstack should stay off the toast`
    proto.writeFile = async () => {
      throw new Error(reason)
    }
    try {
      const result = await saveTextToDownloads(dir, { suggestedName: NAME, content: '全文' })
      assert.equal(result.ok, false)
      if (result.ok) return
      assert.equal(result.error, 'E'.repeat(120))
      assert.equal(result.error.includes('\n'), false)
      assert.equal(result.error.includes('stack'), false)
      assert.equal(await fs.readFile(existing, 'utf8'), 'keep')
      assert.equal(
        (await fs.readdir(dir)).includes('ftcs-session-20261101-153045-1.txt'),
        false,
      )
    } finally {
      proto.writeFile = original
    }
  })
})
