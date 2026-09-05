import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  countEffectiveTextChars,
  extractPdfTextToString,
  isPdfExtension,
  pdfSidecarRelPath,
  pdfSkippedLabel,
  preparePdfSidecarText,
  PDF_MIN_EFFECTIVE_CHARS,
  PDF_SIDECAR_TRUNCATED_BANNER,
  sanitizePdfSidecarText,
} from './profile-pdf-extract.ts'

const fixturePdf = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'sample-text.pdf',
)

describe('profile-pdf-extract helpers', () => {
  it('detects pdf extension case-insensitively', () => {
    assert.equal(isPdfExtension('绿森/手册.PDF'), true)
    assert.equal(isPdfExtension('绿森/手册.md'), false)
  })

  it('builds pdf sidecar relative path', () => {
    assert.equal(pdfSidecarRelPath('绿森/手册.pdf'), '绿森/手册.pdf.txt')
  })

  it('counts effective chars without whitespace', () => {
    assert.equal(countEffectiveTextChars('a b\n\tc'), 3)
  })

  it('strips null bytes and C0 controls for OpenCode Read compatibility', () => {
    assert.equal(sanitizePdfSidecarText('a\0b\x01c'), 'abc')
    const { text } = preparePdfSidecarText('hello\0world\0')
    assert.equal(text.includes('\0'), false)
    assert.match(text, /helloworld/)
  })

  it('maps skipped labels', () => {
    assert.equal(pdfSkippedLabel('scanned'), '未能提取 PDF 文本，扫描件暂不支持')
    assert.equal(pdfSkippedLabel('too_large'), 'PDF 超过 20MB 上限')
  })

  it('truncates oversized sidecar with banner', () => {
    const long = '字'.repeat(300_000)
    const { text, truncated } = preparePdfSidecarText(long)
    assert.equal(truncated, true)
    assert.equal(text.startsWith(PDF_SIDECAR_TRUNCATED_BANNER), true)
    assert.ok(Buffer.byteLength(text, 'utf8') <= 512 * 1024)
  })
})

describe('extractPdfTextToString integration', () => {
  it('extracts text from sample fixture pdf', async () => {
    assert.ok(fs.existsSync(fixturePdf), 'run fixtures/gen-sample-text-pdf.mjs first')
    const result = await extractPdfTextToString(fixturePdf)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.ok(countEffectiveTextChars(result.text) >= PDF_MIN_EFFECTIVE_CHARS)
    assert.match(result.text, /GreenWood Product Catalog/)
  })

  it('rejects invalid pdf bytes', async () => {
    const tmp = path.join(path.dirname(fixturePdf), 'invalid-temp.pdf')
    fs.writeFileSync(tmp, 'not-a-pdf')
    try {
      const result = await extractPdfTextToString(tmp)
      assert.equal(result.ok, false)
      if (result.ok) return
      assert.equal(result.reason, 'encrypted_or_invalid')
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  })
})
