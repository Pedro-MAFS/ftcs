import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { copyLibrarySourcesToInputs } from './profile-inputs.ts'

const temps: string[] = []

function makeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-profile-in-'))
  temps.push(dir)
  return dir
}

function writeFile(filePath: string, body = 'ok'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body, 'utf8')
}

function writeBookmark(filePath: string, url: string): void {
  writeFile(
    filePath,
    [
      '---',
      'type: website',
      `url: ${url}`,
      'title: site',
      'created_at: 2026-01-01T00:00:00.000Z',
      '---',
      '',
      `公司网站：${url}`,
      '',
    ].join('\n'),
  )
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('copyLibrarySourcesToInputs', () => {
  it('keeps library-relative directories and does not flatten or hyphenate names', () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '说明.txt'), 'a')
    writeFile(path.join(filesRoot, '绿森', '地板', '报价 单.md'), 'b')
    writeBookmark(path.join(filesRoot, '绿森', '地板', 'www.example.com.md'), 'https://www.example.com')
    writeFile(path.join(filesRoot, '客户A', '说明.md'), 'c')

    const copied = copyLibrarySourcesToInputs(
      'prod_20260818_001',
      inputsDir,
      filesRoot,
      ['绿森/地板/www.example.com.md'],
      ['绿森/说明.txt', '绿森/地板/报价 单.md', '客户A/说明.md'],
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.txt')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '地板', '报价 单.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '地板', 'www.example.com.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '客户A', '说明.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '说明.txt')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '报价-单.md')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '说明-2.md')), false)

    assert.deepEqual(copied.websiteUrls, ['https://www.example.com'])
    assert.deepEqual(copied.inputFiles, [
      'data/products/prod_20260818_001/inputs/绿森/说明.txt',
      'data/products/prod_20260818_001/inputs/绿森/地板/报价 单.md',
      'data/products/prod_20260818_001/inputs/客户A/说明.md',
    ])
    assert.deepEqual(copied.sourceInputs, [
      {
        type: 'website',
        library_path: '绿森/地板/www.example.com.md',
        url: 'https://www.example.com',
      },
      { type: 'file', library_path: '绿森/说明.txt' },
      { type: 'file', library_path: '绿森/地板/报价 单.md' },
      { type: 'file', library_path: '客户A/说明.md' },
    ])
    assert.deepEqual(copied.skipped, [])
  })

  it('does not create empty sibling folders', () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    fs.mkdirSync(path.join(filesRoot, '绿森', '空夹'), { recursive: true })
    writeFile(path.join(filesRoot, '绿森', '说明.txt'), 'a')

    copyLibrarySourcesToInputs('prod_1', inputsDir, filesRoot, [], ['绿森/说明.txt'])

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.txt')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '空夹')), false)
  })

  it('skips pdf and images, keeps text, and does not put bookmark md in inputFiles', () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '说明.md'), 'a')
    writeFile(path.join(filesRoot, '绿森', '目录.pdf'), 'fake-pdf')
    writeFile(path.join(filesRoot, '绿森', '图.jpg'), 'fake-jpg')
    writeFile(path.join(filesRoot, '绿森', '无扩展名'), 'raw')
    writeBookmark(path.join(filesRoot, '绿森', 'www.example.com.md'), 'https://www.example.com')

    const copied = copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      ['绿森/www.example.com.md'],
      ['绿森/说明.md', '绿森/目录.pdf', '绿森/图.jpg', '绿森/无扩展名'],
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', 'www.example.com.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '目录.pdf')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '图.jpg')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '无扩展名')), false)
    assert.deepEqual(copied.websiteUrls, ['https://www.example.com'])
    assert.deepEqual(copied.inputFiles, ['data/products/prod_1/inputs/绿森/说明.md'])
    assert.deepEqual(copied.sourceInputs, [
      { type: 'website', library_path: '绿森/www.example.com.md', url: 'https://www.example.com' },
      { type: 'file', library_path: '绿森/说明.md' },
    ])
    assert.equal(copied.skipped.includes('绿森/目录.pdf（当前不支持该格式）'), true)
    assert.equal(copied.skipped.includes('绿森/图.jpg（当前不支持该格式）'), true)
    assert.equal(copied.skipped.includes('绿森/无扩展名（当前不支持该格式）'), true)
  })
})
