import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { classifyInputFile, copyLibrarySourcesToInputs } from './profile-inputs.ts'

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

describe('classifyInputFile', () => {
  it('marks docx/xlsx/pptx as office and images as image', () => {
    assert.equal(classifyInputFile('a/说明.docx'), 'office')
    assert.equal(classifyInputFile('a/报价.XLSX'), 'office')
    assert.equal(classifyInputFile('a/deck.pptx'), 'office')
    assert.equal(classifyInputFile('a/说明.pdf'), 'special')
    assert.equal(classifyInputFile('a/说明.md'), 'supported')
    assert.equal(classifyInputFile('a/样品.jpg'), 'image')
    assert.equal(classifyInputFile('a/宣传.PNG'), 'image')
  })
})

describe('copyLibrarySourcesToInputs', () => {
  it('keeps library-relative directories and does not flatten or hyphenate names', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '说明.txt'), 'a')
    writeFile(path.join(filesRoot, '绿森', '地板', '报价 单.md'), 'b')
    writeBookmark(path.join(filesRoot, '绿森', '地板', 'www.example.com.md'), 'https://www.example.com')
    writeFile(path.join(filesRoot, '客户A', '说明.md'), 'c')

    const copied = await copyLibrarySourcesToInputs(
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

  it('does not create empty sibling folders', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    fs.mkdirSync(path.join(filesRoot, '绿森', '空夹'), { recursive: true })
    writeFile(path.join(filesRoot, '绿森', '说明.txt'), 'a')

    await copyLibrarySourcesToInputs('prod_1', inputsDir, filesRoot, [], ['绿森/说明.txt'])

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.txt')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '空夹')), false)
  })

  it('copies images and skips pdf/unknown; keeps text', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '说明.md'), 'a')
    writeFile(path.join(filesRoot, '绿森', '目录.pdf'), 'fake-pdf')
    writeFile(path.join(filesRoot, '绿森', '图.jpg'), 'fake-jpg')
    writeFile(path.join(filesRoot, '绿森', '无扩展名'), 'raw')
    writeBookmark(path.join(filesRoot, '绿森', 'www.example.com.md'), 'https://www.example.com')

    const copied = await copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      ['绿森/www.example.com.md'],
      ['绿森/说明.md', '绿森/目录.pdf', '绿森/图.jpg', '绿森/无扩展名'],
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '图.jpg')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', 'www.example.com.md')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '目录.pdf')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '无扩展名')), false)
    assert.deepEqual(copied.websiteUrls, ['https://www.example.com'])
    assert.deepEqual(copied.inputFiles, [
      'data/products/prod_1/inputs/绿森/说明.md',
      'data/products/prod_1/inputs/绿森/图.jpg',
    ])
    assert.deepEqual(copied.sourceInputs, [
      { type: 'website', library_path: '绿森/www.example.com.md', url: 'https://www.example.com' },
      { type: 'file', library_path: '绿森/说明.md' },
      { type: 'file', library_path: '绿森/图.jpg' },
    ])
    assert.equal(copied.skipped.includes('绿森/目录.pdf（当前不支持该格式）'), true)
    assert.equal(copied.skipped.includes('绿森/无扩展名（当前不支持该格式）'), true)
  })

  it('copies image-only selection', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, 'MFS', '仅图片', '宣传图.jpg'), 'fake-jpg')

    const copied = await copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      [],
      ['MFS/仅图片/宣传图.jpg'],
    )

    assert.equal(fs.existsSync(path.join(inputsDir, 'MFS', '仅图片', '宣传图.jpg')), true)
    assert.deepEqual(copied.inputFiles, ['data/products/prod_1/inputs/MFS/仅图片/宣传图.jpg'])
    assert.deepEqual(copied.skipped, [])
  })

  it('copies large images without a desktop size cap', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    fs.mkdirSync(filesRoot, { recursive: true })
    fs.writeFileSync(path.join(filesRoot, 'big.jpg'), Buffer.alloc(10 * 1024 * 1024 + 1))

    const copied = await copyLibrarySourcesToInputs('prod_1', inputsDir, filesRoot, [], ['big.jpg'])

    assert.equal(fs.existsSync(path.join(inputsDir, 'big.jpg')), true)
    assert.deepEqual(copied.inputFiles, ['data/products/prod_1/inputs/big.jpg'])
    assert.deepEqual(copied.skipped, [])
  })

  it('extracts office sidecar when CLI ready (injected)', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '地板', '说明.docx'), 'binary-fake')
    writeFile(path.join(filesRoot, '绿森', 'readme.md'), 'md')

    const copied = await copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      [],
      ['绿森/地板/说明.docx', '绿森/readme.md'],
      {
        resolveCli: () => ({ exe: 'C:\\fake\\officecli.exe', source: 'test' }),
        extractOffice: async () => ({ ok: true, text: '抽出的产品说明' }),
      },
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '地板', '说明.docx')), true)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '地板', '说明.docx.txt')), true)
    assert.equal(
      fs.readFileSync(path.join(inputsDir, '绿森', '地板', '说明.docx.txt'), 'utf8'),
      '抽出的产品说明',
    )
    assert.deepEqual(copied.inputFiles, [
      'data/products/prod_1/inputs/绿森/地板/说明.docx.txt',
      'data/products/prod_1/inputs/绿森/readme.md',
    ])
    assert.deepEqual(copied.sourceInputs, [
      { type: 'file', library_path: '绿森/地板/说明.docx' },
      { type: 'file', library_path: '绿森/readme.md' },
    ])
    assert.deepEqual(copied.skipped, [])
  })

  it('skips office when CLI missing', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '说明.docx'), 'x')
    writeFile(path.join(filesRoot, '绿森', '说明.md'), 'y')

    const copied = await copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      [],
      ['绿森/说明.docx', '绿森/说明.md'],
      { resolveCli: () => null },
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.docx')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '说明.md')), true)
    assert.equal(copied.skipped.includes('绿森/说明.docx（未安装 OfficeCLI）'), true)
    assert.deepEqual(copied.inputFiles, ['data/products/prod_1/inputs/绿森/说明.md'])
  })

  it('skips office when extract fails or empty', async () => {
    const root = makeRoot()
    const filesRoot = path.join(root, 'files')
    const inputsDir = path.join(root, 'inputs')
    writeFile(path.join(filesRoot, '绿森', '坏.docx'), 'x')
    writeFile(path.join(filesRoot, '绿森', '空.pptx'), 'y')
    writeFile(path.join(filesRoot, '绿森', 'ok.md'), 'z')

    const copied = await copyLibrarySourcesToInputs(
      'prod_1',
      inputsDir,
      filesRoot,
      [],
      ['绿森/坏.docx', '绿森/空.pptx', '绿森/ok.md'],
      {
        resolveCli: () => ({ exe: 'C:\\fake\\officecli.exe', source: 'test' }),
        extractOffice: async (abs) => {
          if (abs.includes('坏')) return { ok: false, reason: 'corrupt' }
          return { ok: false, reason: '抽出文本为空' }
        },
      },
    )

    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '坏.docx')), false)
    assert.equal(fs.existsSync(path.join(inputsDir, '绿森', '空.pptx')), false)
    assert.equal(copied.skipped.some((s) => s.includes('坏.docx') && s.includes('抽取失败')), true)
    assert.equal(copied.skipped.some((s) => s.includes('空.pptx') && s.includes('抽出文本为空')), true)
    assert.deepEqual(copied.inputFiles, ['data/products/prod_1/inputs/绿森/ok.md'])
  })
})
