import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LibraryTreeNode } from '../../types/library'
import {
  applyLibrarySelect,
  flattenVisibleIds,
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

function dir(rel: string, children: LibraryTreeNode[]): LibraryTreeNode {
  return {
    name: rel.split('/').pop() || rel,
    kind: 'dir',
    relativePath: rel,
    depth: rel.split('/').filter(Boolean).length,
    children,
  }
}

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
    const tree = [
      dir('A', [file('A/a.md')]),
      dir('B', [file('B/b.md')]),
    ]
    assert.deepEqual(flattenVisibleIds(tree, new Set()), ['A', 'B'])
    assert.deepEqual(flattenVisibleIds(tree, new Set(['A'])), ['A', 'A/a.md', 'B'])
  })
})

describe('applyLibrarySelect', () => {
  const visible = ['A', 'A/a.md', 'B', 'B/b.md', 'c.md']

  it('toggles one id and moves the anchor', () => {
    const first = applyLibrarySelect(new Set(), visible, 'A/a.md', 'toggle', null)
    assert.deepEqual([...first.selected], ['A/a.md'])
    assert.equal(first.anchor, 'A/a.md')
    const second = applyLibrarySelect(first.selected, visible, 'B/b.md', 'ctrl', first.anchor)
    assert.deepEqual([...second.selected].sort(), ['A/a.md', 'B/b.md'])
  })

  it('shift-selects a visible range and keeps collapsed checks', () => {
    const hidden = applyLibrarySelect(new Set(['hidden.md']), visible, 'A/a.md', 'toggle', null)
    const ranged = applyLibrarySelect(hidden.selected, visible, 'B/b.md', 'shift', hidden.anchor)
    assert.equal(ranged.selected.has('hidden.md'), true)
    assert.deepEqual(
      [...ranged.selected].filter((id) => id !== 'hidden.md').sort(),
      ['A/a.md', 'B', 'B/b.md'],
    )
    assert.equal(ranged.anchor, 'A/a.md')
    assert.equal(ranged.selected.has('A'), false)
    assert.equal(ranged.selected.has('c.md'), false)
  })
})
