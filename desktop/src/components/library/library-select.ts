import type { LibraryTreeNode } from '../../types/library'

export type LibrarySelectGesture = 'toggle' | 'ctrl' | 'shift'

export function flattenVisibleIds(
  nodes: LibraryTreeNode[],
  expanded: Set<string>,
): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.relativePath)
    if (node.kind === 'dir' && expanded.has(node.relativePath) && node.children.length) {
      out.push(...flattenVisibleIds(node.children, expanded))
    }
  }
  return out
}

export function selectGestureFromEvent(event: {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): LibrarySelectGesture | null {
  if (event.shiftKey) return 'shift'
  if (event.ctrlKey || event.metaKey) return 'ctrl'
  return null
}

export function applyLibrarySelect(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  targetId: string,
  gesture: LibrarySelectGesture,
  anchorId: string | null,
): { selected: Set<string>; anchor: string } {
  if (gesture === 'shift') {
    const anchor = anchorId && visibleIds.includes(anchorId) ? anchorId : targetId
    const i = visibleIds.indexOf(anchor)
    const j = visibleIds.indexOf(targetId)
    const next = new Set(selected)
    if (i < 0 || j < 0) {
      next.add(targetId)
      return { selected: next, anchor }
    }
    const lo = Math.min(i, j)
    const hi = Math.max(i, j)
    for (const id of visibleIds) next.delete(id)
    for (let k = lo; k <= hi; k += 1) {
      const id = visibleIds[k]
      if (id) next.add(id)
    }
    return { selected: next, anchor }
  }

  const next = new Set(selected)
  if (next.has(targetId)) next.delete(targetId)
  else next.add(targetId)
  return { selected: next, anchor: targetId }
}
