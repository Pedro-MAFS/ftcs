import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  collapseImportSources,
  importFilesFromPaths,
} from './library-import.ts'

const temps: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-lib-import-'))
  temps.push(dir)
  fs.mkdirSync(path.join(dir, 'data', 'library', 'files'), { recursive: true })
  return dir
}

function filesDir(workspace: string): string {
  return path.join(workspace, 'data', 'library', 'files')
}

function makeSourceTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-src-'))
  temps.push(dir)
  fs.mkdirSync(path.join(dir, '绿森', '地板'), { recursive: true })
  fs.mkdirSync(path.join(dir, '绿森', '墙板'), { recursive: true })
  fs.writeFileSync(path.join(dir, '绿森', '地板', 'a.md'), 'floor')
  return path.join(dir, '绿森')
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('collapseImportSources', () => {
  it('drops files that sit inside a selected directory', () => {
    const src = makeSourceTree()
    const nested = path.join(src, '地板', 'a.md')
    const collapsed = collapseImportSources([src, nested])
    assert.deepEqual(collapsed, [path.resolve(src)])
  })
})

describe('importFilesFromPaths folders', () => {
  it('copies relative structure including empty dirs', () => {
    const ws = makeWorkspace()
    const src = makeSourceTree()
    const result = importFilesFromPaths('', [src], ws)
    assert.equal(result.imported, 1)
    assert.equal(result.dirsCreated >= 3, true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '绿森', '地板', 'a.md')), true)
    assert.equal(fs.statSync(path.join(filesDir(ws), '绿森', '墙板')).isDirectory(), true)
    assert.equal(fs.readdirSync(path.join(filesDir(ws), '绿森', '墙板')).length, 0)
  })

  it('imports under the destination directory', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), '客户A'))
    const src = makeSourceTree()
    importFilesFromPaths('客户A', [src], ws)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '客户A', '绿森', '地板', 'a.md')), true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '绿森')), false)
  })

  it('merges into an existing same-named folder and unique-renames files', () => {
    const ws = makeWorkspace()
    const dest = path.join(filesDir(ws), '绿森', '地板')
    fs.mkdirSync(dest, { recursive: true })
    fs.writeFileSync(path.join(dest, 'a.md'), 'old')
    const src = makeSourceTree()
    const result = importFilesFromPaths('', [src], ws)
    assert.equal(result.imported, 1)
    assert.equal(fs.readFileSync(path.join(dest, 'a.md'), 'utf8'), 'old')
    assert.equal(fs.existsSync(path.join(dest, 'a-2.md')), true)
  })

  it('still imports loose files', () => {
    const ws = makeWorkspace()
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-file-')), 'note.txt')
    temps.push(path.dirname(file))
    fs.writeFileSync(file, 'hi')
    const result = importFilesFromPaths('', [file], ws)
    assert.equal(result.imported, 1)
    assert.equal(result.dirsCreated, 0)
    assert.equal(fs.existsSync(path.join(filesDir(ws), 'note.txt')), true)
  })

  it('skips importing the library files root', () => {
    const ws = makeWorkspace()
    const result = importFilesFromPaths('', [filesDir(ws)], ws)
    assert.equal(result.imported, 0)
    assert.equal(result.dirsCreated, 0)
    assert.equal(result.skipped.some((s) => s.includes('资料库内部')), true)
  })

  it('skips a source folder that contains the library', () => {
    const ws = makeWorkspace()
    const result = importFilesFromPaths('', [ws], ws)
    assert.equal(result.imported, 0)
    assert.equal(result.skipped.some((s) => s.includes('包含当前资料库')), true)
  })

  it('stops when maxDepth is exceeded', () => {
    const ws = makeWorkspace()
    const src = makeSourceTree()
    const result = importFilesFromPaths('', [src], ws, { maxDepth: 1 })
    assert.equal(result.skipped.some((s) => s.includes('上限')), true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '绿森')), true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '绿森', '地板', 'a.md')), false)
  })
})
