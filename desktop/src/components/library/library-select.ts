import type { LibraryTreeNode } from '../../types/library'

export type LibrarySelectGesture = 'toggle' | 'ctrl' | 'shift'
export type LibraryCheckState = 'checked' | 'unchecked' | 'indeterminate'

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

export function findLibraryNode(
  nodes: LibraryTreeNode[],
  id: string,
): LibraryTreeNode | null {
  for (const node of nodes) {
    if (node.relativePath === id) return node
    const found = findLibraryNode(node.children, id)
    if (found) return found
  }
  return null
}

export function collectSubtreeIds(node: LibraryTreeNode): string[] {
  const out = [node.relativePath]
  for (const child of node.children) out.push(...collectSubtreeIds(child))
  return out
}

function descendantIds(node: LibraryTreeNode): string[] {
  const out: string[] = []
  for (const child of node.children) out.push(...collectSubtreeIds(child))
  return out
}

function setSubtree(selected: Set<string>, node: LibraryTreeNode, on: boolean) {
  for (const id of collectSubtreeIds(node)) {
    if (on) selected.add(id)
    else selected.delete(id)
  }
}

/** 子项全选则勾上文件夹；未全选则去掉文件夹勾选（空夹不由子项推导）。 */
export function normalizeFolderChecks(
  tree: LibraryTreeNode[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected)
  function walk(nodes: LibraryTreeNode[]) {
    for (const node of nodes) {
      if (node.children.length) walk(node.children)
      if (node.kind !== 'dir') continue
      const desc = descendantIds(node)
      if (desc.length === 0) continue
      if (desc.every((id) => next.has(id))) next.add(node.relativePath)
      else next.delete(node.relativePath)
    }
  }
  walk(tree)
  return next
}

export function libraryCheckState(
  node: LibraryTreeNode,
  selected: ReadonlySet<string>,
): LibraryCheckState {
  if (node.kind !== 'dir') {
    return selected.has(node.relativePath) ? 'checked' : 'unchecked'
  }
  const desc = descendantIds(node)
  if (desc.length === 0) {
    return selected.has(node.relativePath) ? 'checked' : 'unchecked'
  }
  let n = 0
  for (const id of desc) {
    if (selected.has(id)) n += 1
  }
  if (n === 0) return 'unchecked'
  if (n === desc.length) return 'checked'
  return 'indeterminate'
}

export function applyLibrarySelect(
  tree: LibraryTreeNode[],
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  targetId: string,
  gesture: LibrarySelectGesture,
  anchorId: string | null,
): { selected: Set<string>; anchor: string } {
  const target = findLibraryNode(tree, targetId)

  if (gesture === 'shift') {
    const anchor = anchorId && visibleIds.includes(anchorId) ? anchorId : targetId
    const i = visibleIds.indexOf(anchor)
    const j = visibleIds.indexOf(targetId)
    const next = new Set(selected)
    if (i < 0 || j < 0) {
      if (target) setSubtree(next, target, true)
      else next.add(targetId)
      return { selected: normalizeFolderChecks(tree, next), anchor }
    }
    const lo = Math.min(i, j)
    const hi = Math.max(i, j)
    for (const id of visibleIds) {
      const node = findLibraryNode(tree, id)
      if (node) setSubtree(next, node, false)
      else next.delete(id)
    }
    for (let k = lo; k <= hi; k += 1) {
      const id = visibleIds[k]
      if (!id) continue
      const node = findLibraryNode(tree, id)
      if (node) setSubtree(next, node, true)
      else next.add(id)
    }
    return { selected: normalizeFolderChecks(tree, next), anchor }
  }

  const next = new Set(selected)
  const turnOn = target
    ? libraryCheckState(target, selected) !== 'checked'
    : !next.has(targetId)
  if (target) setSubtree(next, target, turnOn)
  else if (turnOn) next.add(targetId)
  else next.delete(targetId)
  return { selected: normalizeFolderChecks(tree, next), anchor: targetId }
}
