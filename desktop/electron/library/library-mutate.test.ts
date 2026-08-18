import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { moveLibraryEntry, renameLibraryEntry } from './library-mutate.ts'
import { addWebsiteToFolder } from './library-website.ts'
import { readWebsiteBookmark } from './library-website.ts'

const temps: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-lib-mut-'))
  temps.push(dir)
  fs.mkdirSync(path.join(dir, 'data', 'library', 'files'), { recursive: true })
  return dir
}

function filesDir(workspace: string): string {
  return path.join(workspace, 'data', 'library', 'files')
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('renameLibraryEntry', () => {
  it('renames a file and keeps spaces', () => {
    const ws = makeWorkspace()
    fs.writeFileSync(path.join(filesDir(ws), 'a.txt'), 'x')
    const result = renameLibraryEntry('a.txt', '产品 说明.txt', ws)
    assert.equal(result.relativePath, '产品 说明.txt')
    assert.equal(fs.existsSync(path.join(filesDir(ws), '产品 说明.txt')), true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), 'a.txt')), false)
  })

  it('rejects a name that already exists', () => {
    const ws = makeWorkspace()
    fs.writeFileSync(path.join(filesDir(ws), 'a.txt'), 'a')
    fs.writeFileSync(path.join(filesDir(ws), 'b.txt'), 'b')
    assert.throws(() => renameLibraryEntry('a.txt', 'b.txt', ws), /已存在同名/)
    assert.equal(fs.readFileSync(path.join(filesDir(ws), 'a.txt'), 'utf8'), 'a')
  })

  it('renames a website bookmark title and file', () => {
    const ws = makeWorkspace()
    addWebsiteToFolder('https://www.example.com', '', ws)
    const result = renameLibraryEntry('www.example.com.md', '绿森官网', ws)
    assert.equal(result.relativePath, '绿森官网.md')
    const meta = readWebsiteBookmark(path.join(filesDir(ws), '绿森官网.md'))
    assert.equal(meta?.title, '绿森官网')
    assert.equal(meta?.url, 'https://www.example.com')
  })
})

describe('moveLibraryEntry', () => {
  it('moves a file into another folder', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), '客户A'))
    fs.writeFileSync(path.join(filesDir(ws), 'a.md'), 'x')
    const result = moveLibraryEntry('a.md', '客户A', ws)
    assert.equal(result.relativePath, '客户A/a.md')
    assert.equal(fs.existsSync(path.join(filesDir(ws), '客户A', 'a.md')), true)
    assert.equal(fs.existsSync(path.join(filesDir(ws), 'a.md')), false)
  })

  it('rejects moving a folder into itself', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), '绿森', '地板'), { recursive: true })
    assert.throws(() => moveLibraryEntry('绿森', '绿森/地板', ws), /不能移动到自身或子文件夹/)
    assert.equal(fs.existsSync(path.join(filesDir(ws), '绿森', '地板')), true)
  })

  it('rejects a name conflict in the destination', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), 'A'))
    fs.writeFileSync(path.join(filesDir(ws), 'a.md'), 'src')
    fs.writeFileSync(path.join(filesDir(ws), 'A', 'a.md'), 'keep')
    assert.throws(() => moveLibraryEntry('a.md', 'A', ws), /已存在同名/)
    assert.equal(fs.readFileSync(path.join(filesDir(ws), 'a.md'), 'utf8'), 'src')
    assert.equal(fs.readFileSync(path.join(filesDir(ws), 'A', 'a.md'), 'utf8'), 'keep')
  })
})
