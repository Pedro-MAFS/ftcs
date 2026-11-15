import type { LibraryTreeNode } from '../../types/library'
import type { ProfileSummary } from '../../types/electron'

export type MentionCandidate = { kind: 'library' | 'website' | 'profile'; value: string; label: string; detail: string }
export type MentionQuery = { start: number; end: number; query: string }

export function findMentionQuery(text: string, cursor: number): MentionQuery | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|[^a-zA-Z0-9_.+%\-])@([^@\n]{0,80})$/u)
  if (!match) return null
  const query = match[1]
  return { start: cursor - query.length - 1, end: cursor, query }
}

export function replaceMentionQuery(text: string, query: MentionQuery): string {
  return text.slice(0, query.start) + text.slice(query.end)
}

export function listMentionCandidates(tree: LibraryTreeNode[], profiles: ProfileSummary[]): MentionCandidate[] {
  const result: MentionCandidate[] = profiles.map(profile => ({ kind: 'profile', value: profile.id, label: profile.productNames?.join('、') || profile.productName || profile.companyName || profile.id, detail: profile.id }))
  const walk = (nodes: LibraryTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'dir') walk(node.children)
      else result.push({ kind: node.kind === 'website' ? 'website' : 'library', value: node.relativePath, label: node.name, detail: node.relativePath })
    }
  }
  walk(tree)
  return result
}

export function filterMentionCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const needle = query.trim().toLocaleLowerCase()
  return candidates.filter(item => !needle || `${item.label} ${item.detail}`.toLocaleLowerCase().includes(needle)).slice(0, 30)
}
