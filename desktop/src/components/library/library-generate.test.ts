import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LibraryTreeNode } from '../../types/library'
import { expandGenerateSelection } from './library-generate'

function file(rel: string): LibraryTreeNode {
  return {
    name: rel.split('/').pop() || rel,
    kind: 'file',
    relativePath: rel,
    depth: rel.split('/').filter(Boolean).length,
    children: [],
  }
}

function website(rel: string): LibraryTreeNode {
  return {
    name: rel.split('/').pop() || rel,
    kind: 'website',
    relativePath: rel,
    depth: rel.split('/').filter(Boolean).length,
    url: 'https://www.example.com',
    children: [],
  }
}

function dir(rel: string, children: LibraryTreeNode[]): LibraryTreeNode {
  return {
    name: rel.split('/').pop() || rel,
    kind: 'dir',
    relativePath: rel,
    depth: rel.split('/').filter(Boolean).length,
    children,
  }
}

const tree: LibraryTreeNode[] = [
  dir('绿森', [
    dir('绿森/地板', [
      file('绿森/地板/a.md'),
      website('绿森/地板/www.example.com.md'),
    ]),
    file('绿森/说明.md'),
  ]),
  dir('客户A', [file('客户A/b.md'), file('客户A/c.md')]),
  file('报价.txt'),
  dir('空夹', []),
]

describe('expandGenerateSelection', () => {
  it('does not confirm when only files are checked', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森/说明.md']))
    assert.equal(result.needsConfirm, false)
    assert.equal(result.empty, false)
    assert.deepEqual(result.folderPaths, [])
    assert.deepEqual(result.filePaths, ['绿森/说明.md'])
    assert.deepEqual(result.websitePaths, [])
  })

  it('expands a folder without child dirs and does not confirm', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森/地板']))
    assert.equal(result.needsConfirm, false)
    assert.deepEqual(result.folderPaths, ['绿森/地板'])
    assert.deepEqual(result.filePaths, ['绿森/地板/a.md'])
    assert.deepEqual(result.websitePaths, ['绿森/地板/www.example.com.md'])
  })

  it('dedupes a parent folder and files inside it', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森', '绿森/说明.md', '绿森/地板/a.md']))
    assert.deepEqual(result.folderPaths, ['绿森'])
    assert.deepEqual(result.filePaths, ['绿森/地板/a.md', '绿森/说明.md'])
    assert.deepEqual(result.websitePaths, ['绿森/地板/www.example.com.md'])
  })

  it('drops nested selected folders in favor of the outermost', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森', '绿森/地板']))
    assert.deepEqual(result.folderPaths, ['绿森'])
    assert.equal(result.filePaths.includes('绿森/地板/a.md'), true)
  })

  it('confirms when two outermost folders are selected', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森', '客户A']))
    assert.equal(result.needsConfirm, true)
    assert.equal(result.confirmMessage.includes('文件夹 绿森（2 个文件，1 个网站）'), true)
    assert.equal(result.confirmMessage.includes('文件夹 客户A（2 个文件）'), true)
    assert.equal(result.confirmMessage.includes('合计 4 个文件、1 个网站。取消则不生成。'), true)
    assert.equal(result.confirmMessage.includes('不会按文件夹各出一份'), true)
    assert.deepEqual(result.filePaths, ['客户A/b.md', '客户A/c.md', '绿森/地板/a.md', '绿森/说明.md'])
  })

  it('confirms when the only selected folder has a child dir', () => {
    const result = expandGenerateSelection(tree, new Set(['绿森']))
    assert.equal(result.needsConfirm, true)
    assert.deepEqual(result.folderPaths, ['绿森'])
  })

  it('lists extras that are not under outermost folders', () => {
    const result = expandGenerateSelection(tree, new Set(['客户A', '报价.txt']))
    assert.equal(result.needsConfirm, false)
    assert.equal(result.confirmMessage.includes('另选 报价.txt'), true)
    assert.deepEqual(result.filePaths, ['客户A/b.md', '客户A/c.md', '报价.txt'])
  })

  it('marks empty folders as empty and keeps websites out of filePaths', () => {
    const empty = expandGenerateSelection(tree, new Set(['空夹']))
    assert.equal(empty.empty, true)
    assert.deepEqual(empty.filePaths, [])
    assert.deepEqual(empty.websitePaths, [])

    const mixed = expandGenerateSelection(tree, new Set(['绿森/地板']))
    assert.equal(mixed.filePaths.includes('绿森/地板/www.example.com.md'), false)
  })

  it('ignores ids that are no longer on the tree', () => {
    const result = expandGenerateSelection(tree, new Set(['gone.md', '报价.txt']))
    assert.deepEqual(result.filePaths, ['报价.txt'])
  })
})
