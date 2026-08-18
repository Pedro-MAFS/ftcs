import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { libraryContextItems } from './library-context'

describe('libraryContextItems', () => {
  it('blank menu has create/paste/upload/save-website and no delete', () => {
    const ids = libraryContextItems('blank').map((i) => i.id)
    assert.deepEqual(ids, ['mkdir', 'paste', 'upload', 'save-website', 'import-folder'])
    assert.equal(libraryContextItems('blank').find((i) => i.id === 'save-website')?.disabled, undefined)
    assert.equal(libraryContextItems('blank').find((i) => i.id === 'import-folder')?.disabled, undefined)
  })

  it('root menu cannot delete and can save website', () => {
    const items = libraryContextItems('root')
    assert.equal(items.some((i) => i.id === 'delete'), false)
    assert.equal(items.find((i) => i.id === 'mkdir')?.label, '新建文件夹')
    assert.equal(items.find((i) => i.id === 'save-website')?.disabled, undefined)
  })

  it('dir menu can delete and uses 到此 labels', () => {
    const items = libraryContextItems('dir')
    assert.equal(items.find((i) => i.id === 'mkdir')?.label, '新建子文件夹')
    assert.equal(items.find((i) => i.id === 'paste')?.label, '粘贴到此')
    assert.equal(items.find((i) => i.id === 'import-folder')?.disabled, undefined)
    assert.equal(items.find((i) => i.id === 'save-website')?.disabled, undefined)
    assert.equal(items.find((i) => i.id === 'delete')?.danger, true)
    assert.equal(items.find((i) => i.id === 'rename')?.disabled, true)
  })

  it('file menu is rename placeholder plus delete', () => {
    const items = libraryContextItems('file')
    assert.deepEqual(
      items.map((i) => i.id),
      ['rename', 'delete'],
    )
    assert.equal(items[0]?.disabled, true)
  })

  it('website menu can open and delete', () => {
    const items = libraryContextItems('website')
    assert.deepEqual(
      items.map((i) => i.id),
      ['open-website', 'rename', 'delete'],
    )
    assert.equal(items.find((i) => i.id === 'open-website')?.disabled, undefined)
    assert.equal(items.find((i) => i.id === 'rename')?.disabled, true)
    assert.equal(items.find((i) => i.id === 'delete')?.danger, true)
  })
})
