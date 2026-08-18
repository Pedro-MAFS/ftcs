import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { collectFilePaths, collectWebsitePaths, listFilesTree } from './library-tree.ts'
import {
  addWebsiteToFolder,
  migrateWebsitesIntoFiles,
  normalizeWebsiteUrl,
} from './library-website.ts'

const temps: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-lib-web-'))
  temps.push(dir)
  fs.mkdirSync(path.join(dir, 'data', 'library', 'files'), { recursive: true })
  return dir
}

function filesDir(workspace: string): string {
  return path.join(workspace, 'data', 'library', 'files')
}

function websitesDir(workspace: string): string {
  return path.join(workspace, 'data', 'library', 'websites')
}

function writeBookmark(filePath: string, url: string, title = 'site'): void {
  fs.writeFileSync(
    filePath,
    [
      '---',
      'type: website',
      `url: ${url}`,
      `title: ${title}`,
      'created_at: 2026-01-01T00:00:00.000Z',
      '---',
      '',
      `公司网站：${url}`,
      '',
    ].join('\n'),
    'utf8',
  )
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('normalizeWebsiteUrl', () => {
  it('adds https and strips trailing slash', () => {
    assert.equal(normalizeWebsiteUrl('www.example.com/'), 'https://www.example.com')
  })

  it('rejects empty and invalid URLs', () => {
    assert.throws(() => normalizeWebsiteUrl('  '), /请输入公司网站 URL/)
    assert.throws(() => normalizeWebsiteUrl('http://'), /URL 格式无效/)
  })
})

describe('addWebsiteToFolder', () => {
  it('writes a bookmark into the target folder', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), '绿森', '地板'), { recursive: true })
    const created = addWebsiteToFolder('https://www.example.com', '绿森/地板', ws)
    assert.equal(created.relativePath, '绿森/地板/www.example.com.md')
    assert.equal(created.url, 'https://www.example.com')
    assert.equal(
      fs.existsSync(path.join(filesDir(ws), '绿森', '地板', 'www.example.com.md')),
      true,
    )
  })

  it('rejects the same URL in the same folder', () => {
    const ws = makeWorkspace()
    addWebsiteToFolder('https://www.example.com', '', ws)
    assert.throws(
      () => addWebsiteToFolder('https://www.example.com/', '', ws),
      /该文件夹已保存此网站/,
    )
  })

  it('allows the same URL in a different folder', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), 'A'), { recursive: true })
    fs.mkdirSync(path.join(filesDir(ws), 'B'), { recursive: true })
    const a = addWebsiteToFolder('https://www.example.com', 'A', ws)
    const b = addWebsiteToFolder('https://www.example.com', 'B', ws)
    assert.equal(a.relativePath, 'A/www.example.com.md')
    assert.equal(b.relativePath, 'B/www.example.com.md')
  })
})

describe('migrateWebsitesIntoFiles', () => {
  it('moves old websites md into files root', () => {
    const ws = makeWorkspace()
    const srcDir = websitesDir(ws)
    fs.mkdirSync(srcDir, { recursive: true })
    writeBookmark(path.join(srcDir, 'a.md'), 'https://a.example.com', 'a')
    const result = migrateWebsitesIntoFiles(ws)
    assert.equal(result.moved, 1)
    assert.equal(fs.existsSync(path.join(srcDir, 'a.md')), false)
    assert.equal(fs.existsSync(path.join(filesDir(ws), 'a.md')), true)
  })

  it('renames on conflict so the existing files entry is kept', () => {
    const ws = makeWorkspace()
    const srcDir = websitesDir(ws)
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(filesDir(ws), 'a.md'), 'keep-me', 'utf8')
    writeBookmark(path.join(srcDir, 'a.md'), 'https://a.example.com', 'a')
    const result = migrateWebsitesIntoFiles(ws)
    assert.equal(result.moved, 1)
    assert.equal(fs.readFileSync(path.join(filesDir(ws), 'a.md'), 'utf8'), 'keep-me')
    assert.equal(fs.existsSync(path.join(filesDir(ws), 'a-2.md')), true)
  })

  it('is idempotent when websites dir is empty', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(websitesDir(ws), { recursive: true })
    assert.equal(migrateWebsitesIntoFiles(ws).moved, 0)
    assert.equal(migrateWebsitesIntoFiles(ws).moved, 0)
  })
})

describe('listFilesTree website nodes', () => {
  it('marks type: website md as website and leaves other md as file', () => {
    const ws = makeWorkspace()
    const root = filesDir(ws)
    writeBookmark(path.join(root, 'www.example.com.md'), 'https://www.example.com', 'www.example.com')
    fs.writeFileSync(path.join(root, 'notes.md'), '普通说明', 'utf8')
    const { tree } = listFilesTree(ws)
    const kinds = Object.fromEntries(tree.map((n) => [n.name, n.kind]))
    assert.equal(kinds['www.example.com'], 'website')
    assert.equal(kinds['notes.md'], 'file')
    const bookmark = tree.find((n) => n.kind === 'website')
    assert.equal(bookmark?.url, 'https://www.example.com')
    assert.deepEqual(collectWebsitePaths(tree), ['www.example.com.md'])
    assert.deepEqual(collectFilePaths(tree), ['notes.md'])
  })
})
