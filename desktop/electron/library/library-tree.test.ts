import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  collectFilePaths,
  listFilesTree,
  nextFocusAfterDelete,
  parentDir,
  resolveExistingFocusDir,
} from './library-tree.ts'

const temps: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-lib-tree-'))
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

describe('listFilesTree', () => {
  it('returns empty tree for empty files root', () => {
    const ws = makeWorkspace()
    const result = listFilesTree(ws)
    assert.deepEqual(result.tree, [])
    assert.equal(result.truncated, false)
  })

  it('creates files root when missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-lib-tree-'))
    temps.push(dir)
    const result = listFilesTree(dir)
    assert.equal(fs.existsSync(filesDir(dir)), true)
    assert.deepEqual(result.tree, [])
  })

  it('lists first-level dirs before files and sorts names', () => {
    const ws = makeWorkspace()
    const root = filesDir(ws)
    fs.writeFileSync(path.join(root, '说明.txt'), 'hi')
    fs.mkdirSync(path.join(root, '公司B'))
    fs.mkdirSync(path.join(root, '公司A'))
    fs.writeFileSync(path.join(root, '公司A', 'hidden.md'), 'x')

    const { tree, truncated } = listFilesTree(ws)
    assert.equal(truncated, false)
    assert.deepEqual(
      tree.map((n) => `${n.kind}:${n.name}`),
      ['dir:公司A', 'dir:公司B', 'file:说明.txt'],
    )
    assert.equal(tree[0].depth, 1)
    assert.equal(tree[0].children[0].relativePath, '公司A/hidden.md')
    assert.equal(tree[0].children[0].depth, 2)
  })

  it('skips names containing ..', () => {
    const ws = makeWorkspace()
    const root = filesDir(ws)
    fs.writeFileSync(path.join(root, 'ok.txt'), 'ok')
    const { tree } = listFilesTree(ws)
    assert.equal(
      tree.some((n) => n.name.includes('..')),
      false,
    )
    assert.equal(tree.some((n) => n.name === 'ok.txt'), true)
  })

  it('truncates when node cap is hit', () => {
    const ws = makeWorkspace()
    const root = filesDir(ws)
    fs.writeFileSync(path.join(root, 'a.txt'), 'a')
    fs.writeFileSync(path.join(root, 'b.txt'), 'b')
    fs.writeFileSync(path.join(root, 'c.txt'), 'c')
    const { tree, truncated } = listFilesTree(ws, { maxNodes: 2 })
    assert.equal(truncated, true)
    assert.equal(tree.length, 2)
  })

  it('stops descending past maxDepth', () => {
    const ws = makeWorkspace()
    const root = filesDir(ws)
    fs.mkdirSync(path.join(root, 'l1', 'l2'), { recursive: true })
    fs.writeFileSync(path.join(root, 'l1', 'l2', 'deep.txt'), 'x')
    const { tree, truncated } = listFilesTree(ws, { maxDepth: 1 })
    assert.equal(truncated, true)
    assert.equal(tree[0].name, 'l1')
    assert.equal(tree[0].children.length, 0)
  })
})

describe('tree helpers', () => {
  it('parentDir and nextFocusAfterDelete', () => {
    assert.equal(parentDir('公司A/地板/a.md'), '公司A/地板')
    assert.equal(parentDir('公司A'), '')
    assert.equal(nextFocusAfterDelete('公司A', '公司A/地板'), '')
    assert.equal(nextFocusAfterDelete('公司A/地板', '公司A/地板'), '公司A')
    assert.equal(nextFocusAfterDelete('公司A', '公司B'), '公司B')
  })

  it('resolveExistingFocusDir falls back when missing', () => {
    const ws = makeWorkspace()
    fs.mkdirSync(path.join(filesDir(ws), '公司A'))
    const { tree } = listFilesTree(ws)
    assert.equal(resolveExistingFocusDir(tree, '公司A'), '公司A')
    assert.equal(resolveExistingFocusDir(tree, 'gone'), '')
    assert.equal(collectFilePaths(tree).length, 0)
  })
})
