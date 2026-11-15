import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error The test runner loads TypeScript directly.
import { findMentionQuery, replaceMentionQuery, listMentionCandidates, filterMentionCandidates } from './composer-references.ts'

test('recognizes @ in Chinese text but not email addresses and preserves surrounding text', () => {
  const text = '请参考@产品 A 继续编辑'
  const cursor = text.indexOf(' 继续')
  const query = findMentionQuery(text, cursor)!
  assert.equal(query.query, '产品 A')
  assert.equal(replaceMentionQuery(text, query), '请参考 继续编辑')
  assert.equal(findMentionQuery('mail user@example.com', 21), null)
  assert.equal(findMentionQuery('hello @', 7)?.query, '')
})

test('flattens library and profile candidates and searches names or paths', () => {
  const candidates = listMentionCandidates([{ name: 'folder', kind: 'dir', relativePath: 'folder', depth: 1, children: [{ name: '图.png', kind: 'file', relativePath: 'folder/图.png', depth: 2, children: [] }] }], [{ id: 'p1', status: 'draft', missingFields: [], profilePath: 'x', productNames: ['泵'] }])
  assert.deepEqual(candidates.map(item => item.kind), ['profile', 'library'])
  assert.equal(filterMentionCandidates(candidates, 'folder')[0]?.label, '图.png')
  assert.equal(filterMentionCandidates(candidates, 'p1')[0]?.label, '泵')
})
