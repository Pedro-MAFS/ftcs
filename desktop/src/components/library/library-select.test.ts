import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LibraryTreeNode } from '../../types/library'
import {
  applyLibrarySelect,
  flattenVisibleIds,
  libraryCheckState,
  normalizeFolderChecks,
  selectGestureFromEvent,
} from './library-select'

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
  dir('A', [
    file('A/a.md'),
    file('A/a2.md'),
    dir('A/sub', [file('A/sub/x.md')]),
  ]),
  dir('B', [file('B/b.md')]),
  file('c.md'),
  dir('空夹', []),
]

describe('selectGestureFromEvent', () => {
  it('maps shift, ctrl/meta, and plain click', () => {
    assert.equal(selectGestureFromEvent({ shiftKey: true, ctrlKey: false, metaKey: false }), 'shift')
    assert.equal(selectGestureFromEvent({ shiftKey: false, ctrlKey: true, metaKey: false }), 'ctrl')
    assert.equal(selectGestureFromEvent({ shiftKey: false, ctrlKey: false, metaKey: true }), 'ctrl')
    assert.equal(selectGestureFromEvent({ shiftKey: false, ctrlKey: false, metaKey: false }), null)
  })
})

describe('flattenVisibleIds', () => {
  it('omits children of collapsed dirs', () => {
    assert.deepEqual(flattenVisibleIds(tree, new Set()), ['A', 'B', 'c.md', '空夹'])
    assert.deepEqual(flattenVisibleIds(tree, new Set(['A'])), [
      'A',
      'A/a.md',
      'A/a2.md',
      'A/sub',
      'B',
      'c.md',
      '空夹',
    ])
  })
})

describe('applyLibrarySelect cascade', () => {
  const visible = flattenVisibleIds(tree, new Set(['A', 'A/sub', 'B']))

  it('checking a folder selects all descendants', () => {
    const result = applyLibrarySelect(tree, new Set(), visible, 'A', 'toggle', null)
    assert.deepEqual(
      [...result.selected].sort(),
      ['A', 'A/a.md', 'A/a2.md', 'A/sub', 'A/sub/x.md'],
    )
    assert.equal(result.anchor, 'A')
    assert.equal(libraryCheckState(tree[0]!, result.selected), 'checked')
  })

  it('unchecking a folder clears all descendants', () => {
    const on = applyLibrarySelect(tree, new Set(), visible, 'A', 'toggle', null)
    const off = applyLibrarySelect(tree, on.selected, visible, 'A', 'toggle', on.anchor)
    assert.deepEqual([...off.selected], [])
  })

  it('checking every leaf under a folder also checks the folder', () => {
    let selected = new Set<string>()
    for (const id of ['A/a.md', 'A/a2.md', 'A/sub/x.md']) {
      const next = applyLibrarySelect(tree, selected, visible, id, 'ctrl', null)
      selected = next.selected
    }
    assert.equal(selected.has('A'), true)
    assert.equal(selected.has('A/sub'), true)
    assert.equal(libraryCheckState(tree[0]!, selected), 'checked')
  })

  it('unchecking one file under a full folder makes the folder indeterminate', () => {
    const on = applyLibrarySelect(tree, new Set(), visible, 'A', 'toggle', null)
    const next = applyLibrarySelect(tree, on.selected, visible, 'A/a.md', 'toggle', on.anchor)
    assert.equal(next.selected.has('A'), false)
    assert.equal(next.selected.has('A/a.md'), false)
    assert.equal(next.selected.has('A/a2.md'), true)
    assert.equal(next.selected.has('A/sub/x.md'), true)
    assert.equal(libraryCheckState(tree[0]!, next.selected), 'indeterminate')
  })

  it('clicking an indeterminate folder selects the whole subtree', () => {
    const on = applyLibrarySelect(tree, new Set(), visible, 'A', 'toggle', null)
    const partial = applyLibrarySelect(tree, on.selected, visible, 'A/a.md', 'toggle', on.anchor)
    const again = applyLibrarySelect(tree, partial.selected, visible, 'A', 'toggle', partial.anchor)
    assert.equal(libraryCheckState(tree[0]!, again.selected), 'checked')
    assert.equal(again.selected.has('A/a.md'), true)
  })

  it('toggles an empty folder by itself', () => {
    const on = applyLibrarySelect(tree, new Set(), visible, '空夹', 'toggle', null)
    assert.deepEqual([...on.selected], ['空夹'])
    const off = applyLibrarySelect(tree, on.selected, visible, '空夹', 'toggle', on.anchor)
    assert.deepEqual([...off.selected], [])
  })

  it('keeps other folders when ctrl-toggling a file', () => {
    const first = applyLibrarySelect(tree, new Set(), visible, 'c.md', 'toggle', null)
    const second = applyLibrarySelect(tree, first.selected, visible, 'B/b.md', 'ctrl', first.anchor)
    assert.deepEqual([...second.selected].sort(), ['B', 'B/b.md', 'c.md'])
  })

  it('shift-selects a visible range and cascades folders in the range', () => {
    const hiddenTree = [...tree, file('hidden.md')]
    const hiddenVisible = [...visible, 'hidden.md']
    const hidden = applyLibrarySelect(hiddenTree, new Set(), hiddenVisible, 'hidden.md', 'toggle', null)
    const ranged = applyLibrarySelect(
      hiddenTree,
      hidden.selected,
      visible,
      'B/b.md',
      'shift',
      'A/a.md',
    )
    assert.equal(ranged.selected.has('hidden.md'), true)
    assert.equal(ranged.selected.has('A/a.md'), true)
    assert.equal(ranged.selected.has('A/a2.md'), true)
    assert.equal(ranged.selected.has('A/sub/x.md'), true)
    assert.equal(ranged.selected.has('A'), true)
    assert.equal(ranged.selected.has('B'), true)
    assert.equal(ranged.selected.has('B/b.md'), true)
    assert.equal(ranged.selected.has('c.md'), false)
    assert.equal(ranged.anchor, 'A/a.md')
  })
})

describe('normalizeFolderChecks', () => {
  it('does not auto-check an empty folder', () => {
    const next = normalizeFolderChecks(tree, new Set())
    assert.equal(next.has('空夹'), false)
  })

  it('treats a website bookmark as a leaf', () => {
    const withSite = [dir('绿森', [file('绿森/a.md'), website('绿森/www.example.com.md')])]
    const next = normalizeFolderChecks(withSite, new Set(['绿森/a.md', '绿森/www.example.com.md']))
    assert.equal(next.has('绿森'), true)
  })
})
