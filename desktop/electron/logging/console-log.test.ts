import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createConsoleLogWriter, redactLogSecrets } from './console-log.ts'

test('redacts credentials in console text and URLs', () => {
  const raw = `Bearer abc.def.ghi apiKey='secret-value' access_token=secret-token https://example.test/?token=abcdef&x=1 sk-1234567890`
  const text = redactLogSecrets(raw)
  for (const secret of ['abc.def.ghi', 'secret-value', 'secret-token', 'abcdef', 'sk-1234567890']) {
    assert.equal(text.includes(secret), false)
  }
  assert.match(text, /x=1/)
})

test('writes UTF-8 messages and rotates bounded files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-log-test-'))
  try {
    const writer = createConsoleLogWriter(dir, 256)
    writer.write('renderer', 'error', '产品已删除 token=private-value')
    const first = fs.readFileSync(writer.filePath, 'utf8')
    assert.match(first, /\[renderer\] \[error\] 产品已删除/)
    assert.doesNotMatch(first, /private-value/)
    for (let i = 0; i < 30; i += 1) writer.write('main', 'info', `消息 ${i} ${'x'.repeat(30)}`)
    for (const name of fs.readdirSync(dir)) {
      assert.match(name, /^desktop\.log(?:\.[123])?$/)
      assert.ok(fs.statSync(path.join(dir, name)).size <= 256)
    }
    assert.ok(fs.existsSync(`${writer.filePath}.1`))
    assert.equal(fs.existsSync(`${writer.filePath}.4`), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a write failure does not escape to the application', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-log-test-'))
  try {
    const file = path.join(dir, 'file')
    fs.writeFileSync(file, 'x')
    assert.doesNotThrow(() => createConsoleLogWriter(file).write('main', 'error', 'message'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
