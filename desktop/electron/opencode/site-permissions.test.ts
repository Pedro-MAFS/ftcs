import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { decideSitePermission, isSitePath } from './site-permissions.ts'
import { PermissionCoordinator, readPermissionAsk } from './permission-gate.ts'

test('site edits require the current session, complete targets, and reject links and escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-permission-'))
  const site = path.join(root, 'website'); fs.mkdirSync(site)
  fs.writeFileSync(path.join(site, 'safe.txt'), 'safe')
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside')
  fs.symlinkSync(root, path.join(site, 'link'), 'junction')
  const classify = (metadata: Record<string, unknown>, patterns = ['website/safe.txt'], sessionId = 'ses') => {
    const isPatch = Array.isArray(metadata.files)
    return decideSitePermission({ ask: { id: '1', permission: 'edit', sessionId, callId: 'call', patterns, metadata }, activeSession: 'ses', activeRoot: root, currentRoot: root, toolCall: isPatch ? { tool: 'apply_patch', input: { patchText: 'patch' } } : { tool: 'edit', input: { filePath: metadata.filepath } } })
  }
  try {
    assert.equal(classify({ filepath: path.join(site, 'safe.txt') }).action, 'allow')
    assert.equal(classify({ filepath: path.join(site, 'new', 'page.vue') }).action, 'allow')
    assert.equal(classify({ filepath: path.join(root, 'outside.txt') }).action, 'deny')
    assert.equal(classify({ filepath: path.join(site, 'link', 'outside.txt') }).action, 'deny')
    assert.equal(classify({ filepath: path.join(site, 'safe.txt') }, ['website/safe.txt'], 'other').action, 'deny')
    assert.equal(classify({ files: [{ filePath: path.join(site, 'safe.txt'), type: 'move', movePath: path.join(root, 'outside.txt') }] }).action, 'deny')
    assert.equal(classify({ files: [{ filePath: path.join(site, 'safe.txt'), type: 'update' }, { filePath: path.join(root, 'outside.txt'), type: 'update' }] }, ['a', 'b']).action, 'deny')
    assert.equal(classify({ files: [{ filePath: path.join(site, 'safe.txt'), type: 'update' }] }, []).action, 'deny')
    assert.equal(isSitePath(site, `${site}/../outside.txt`), false)
    const hard = path.join(site, 'hard.txt'); fs.linkSync(path.join(root, 'outside.txt'), hard)
    assert.equal(isSitePath(site, hard), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('shell permissions require a matching call and show its exact command and site directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-shell-'))
  const site = path.join(root, 'website'); fs.mkdirSync(site)
  try {
    const ask = { id: '1', permission: 'bash', sessionId: 'ses', metadata: { command: 'npm run test' } }
    const base = { ask, activeSession: 'ses', activeRoot: root, currentRoot: root }
    assert.deepEqual(decideSitePermission({ ...base, toolCall: { tool: 'bash', input: { command: 'npm run test', workdir: site } } }), { action: 'ask', command: 'npm run test', directory: site })
    assert.equal(decideSitePermission({ ...base }).action, 'deny')
    assert.equal(decideSitePermission({ ...base, toolCall: { tool: 'bash', input: { command: 'other', workdir: site } } }).action, 'deny')
    assert.equal(decideSitePermission({ ...base, toolCall: { tool: 'bash', input: { command: 'npm run test', workdir: root } } }).action, 'deny')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('permission events carry v1/v2 resource and tool-call identity', () => {
  const ask = readPermissionAsk({ type: 'permission.v2.asked', properties: { id: 'req', sessionID: 'ses', action: 'edit', resources: ['website/a'], source: { type: 'tool', callID: 'c' }, metadata: { filepath: '/site/a' } } })
  assert.equal(ask?.sessionId, 'ses'); assert.equal(ask?.callId, 'c'); assert.deepEqual(ask?.patterns, ['website/a'])
})

test('automatic tasks reject even site edits; command authorization is rechecked on reply', async () => {
  let running = true, valid = true
  const calls: Array<{ requestID: string; reply: string }> = []
  const cards: Array<unknown> = []
  const gate = new PermissionCoordinator({ isRunning: () => running, hasFailed: () => false, reply: async call => { calls.push(call); return 'ok' }, emit: card => cards.push(card), onReplyFailed: () => {}, classifyHardBoundary: () => valid ? { action: 'ask', command: 'npm run test', directory: '/site' } : { action: 'deny' } })
  await gate.onAsked({ id: 'auto', permission: 'bash' })
  assert.equal(calls[0].reply, 'reject'); assert.equal(cards.length, 0)
  running = false
  await gate.onAsked({ id: 'chat', permission: 'bash' })
  assert.deepEqual(cards[0], { permission: 'bash', command: 'npm run test', directory: '/site' })
  valid = false
  assert.equal((await gate.replyFromUser('once')).ok, false)
  assert.equal(calls.at(-1)?.reply, 'reject')
})
