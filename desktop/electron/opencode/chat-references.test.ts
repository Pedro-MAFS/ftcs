import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
// @ts-expect-error The test runner loads TypeScript directly.
import { ChatReferenceRegistry, isSelectedRead } from './chat-references.ts'

test('native selection keeps original bytes and authorizes only the selected external file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-ref-work-'))
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-ref-out-'))
  try {
    const file = path.join(external, '说明 资料.unknown'), other = path.join(external, 'other.txt')
    fs.writeFileSync(file, 'original'); fs.writeFileSync(other, 'other')
    const registry = new ChatReferenceRegistry(), view = registry.addFile(1, root, file, 'local')
    const refs = registry.resolve(1, root, [view.id])
    assert.equal(fs.readFileSync(file, 'utf8'), 'original')
    assert.deepEqual(fs.readdirSync(root), [])
    assert.equal(isSelectedRead(refs, root, { filePath: file }, { filepath: file }), true)
    assert.equal(isSelectedRead(refs, root, { filePath: other }, { filepath: other }), false)
    assert.equal(isSelectedRead(refs, root, { filePath: file }, { filepath: other }), false)
    assert.equal(isSelectedRead(refs, root, { filePath: external }, { filepath: external }), false)
    assert.throws(() => registry.resolve(2, root, [view.id]), /失效/)
    assert.throws(() => registry.resolve(1, external, [view.id]), /失效/)
    fs.unlinkSync(file)
    assert.throws(() => registry.resolve(1, root, [view.id]), /删除|不可访问/)
    assert.equal(isSelectedRead(refs, root, { filePath: file }, { filepath: file }), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(external, { recursive: true, force: true }) }
})

test('library and profile handles reject traversal and escaping links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-ref-work-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-ref-out-'))
  try {
    const library = path.join(root, 'data/library/files'), products = path.join(root, 'data/products/p1')
    fs.mkdirSync(library, { recursive: true }); fs.mkdirSync(products, { recursive: true })
    fs.writeFileSync(path.join(library, '说明.txt'), 'data'); fs.writeFileSync(path.join(products, 'profile.json'), '{}')
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret'); fs.symlinkSync(outside, path.join(library, 'link'), 'junction')
    const registry = new ChatReferenceRegistry()
    assert.equal(registry.addLibrary(1, root, '说明.txt', 'library').detail, '说明.txt')
    assert.equal(registry.addProfile(1, root, 'p1').detail, 'p1')
    assert.throws(() => registry.addLibrary(1, root, '../secret.txt', 'library'), /路径无效/)
    assert.throws(() => registry.addLibrary(1, root, 'link/secret.txt', 'library'), /不在/)
    assert.throws(() => registry.addProfile(1, root, '../p1'), /无效/)
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }) }
})
