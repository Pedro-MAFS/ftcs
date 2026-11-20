import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import type { ImapFlow } from 'imapflow'
import { MailboxService } from './service'
import { importFolder } from './import'
import { type Connection } from './types'

test('verify, import, resume, bind sent and isolate retained accounts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-mail-test-'))
  const endpoint = { host: 'mail.example.test', port: 993, username: 'a', security: 'tls' as const }
  const form: Connection = {
    email: 'a@example.test',
    password: 'local-test',
    mode: 'last_30_days',
    imap: endpoint,
    smtp: { ...endpoint, port: 465 },
  }
  let failAuth = true,
    failFetch = true,
    selected = '',
    currentMail = 0
  const client = {
    async connect() {},
    close() {},
    async mailboxOpen(p: string, options: { readOnly: boolean }) {
      assert.ok(options.readOnly)
      selected = p
      return { uidNext: p === 'INBOX' ? 4 : 2, uidValidity: 7n }
    },
    async list() {
      return [{ path: 'Outgoing', flags: new Set() }]
    },
    async search({ uid }: { uid: string }) {
      const [start, end] = uid.split(':').map(Number)
      return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    },
    async fetchAll(uids: number[]) {
      return uids.map(uid => ({ uid, flags: new Set(uid === 2 ? [] : ['\\Seen']) }))
    },
    async fetchOne(s: string) {
      if (s === '3' && failFetch) throw new Error('temporary failure')
      currentMail++
      const date = new Date(Date.now() - (s === '1' && selected === 'INBOX' ? 31 : 1) * 86400000)
      const outbound = selected === 'Outgoing'
      return {
        source: Buffer.from(
          [
            'From: ' + (outbound ? 'a@example.test' : 'alice@example.test'),
            'To: ' + (outbound ? 'bob@example.test' : 'a@example.test'),
            'Message-ID: <' + selected + s + '@example.test>',
            'Subject: quote',
            '',
            'Mail body',
          ].join('\r\n'),
        ),
        internalDate: date,
        flags: new Set(s === '2' ? [] : ['\\Seen']),
      }
    },
  }
  const service = new MailboxService(
    () => root,
    { dir: path.join(root, 'keys'), encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() },
    () => {},
    {
      async verify() {
        if (failAuth) throw new Error('发信认证失败')
      },
      imapClient: () => client as unknown as ImapFlow,
      importFolder,
    },
  )
  t.after(() => {
    service.stop()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const ctx = () => service.snapshot().context
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 200; i++) {
      if (check()) return
      await wait(10)
    }
    assert.fail('同步未完成')
  }
  await assert.rejects(service.act(ctx(), { kind: 'connect', form }), /认证失败/)
  assert.equal(service.snapshot().active, null)
  failAuth = false
  const stale = ctx()
  const a = (await service.act(ctx(), { kind: 'connect', form })).active!
  await until(() => !!service.snapshot().folders[0].error && !service.snapshot().running)
  assert.equal(service.snapshot().imported, 1)
  assert.equal(await service.unreadCount(), 1)
  assert.deepEqual(service.snapshot().candidates, ['Outgoing'])
  failFetch = false
  await service.act(ctx(), { kind: 'retry' })
  await until(() => service.snapshot().imported === 2 && !service.snapshot().running)
  await service.act(ctx(), { kind: 'bind', path: 'Outgoing' })
  await until(() => service.snapshot().imported === 3 && !service.snapshot().running)
  assert.equal(service.snapshot().folders[0].error, undefined)
  assert.deepEqual(service.snapshot().contacts.sort(), ['alice@example.test', 'bob@example.test'])
  const contact = (await service.conversations(ctx(), a)).find(c => c.email === 'alice@example.test')!
  const rename = { kind: 'remark', account: a, contact: contact.id, remark: '  老客户 Alice  ' } as const
  await service.act(ctx(), rename)
  await service.act(ctx(), { kind: 'pin', account: a, contact: contact.id, pinned: true })
  await assert.rejects(service.act(ctx(), { ...rename, remark: '第一行\n第二行' }), /单行/)
  await assert.rejects(service.act(ctx(), { ...rename, remark: 'A'.repeat(121) }), /最多/)
  const destination = 'draft-only@example.test'
  const initial = await service.composer(ctx(), a, destination, { kind: 'get' })
  await service.composer(ctx(), a, destination, {
    kind: 'save',
    version: initial.draft,
    edit: { mode: 'new', text_body: '仅保存在账号 A' },
  })
  await assert.rejects(service.act(stale, { kind: 'disconnect' }), /改变/)
  await service.act(ctx(), { kind: 'disconnect' })
  assert.equal(await service.unreadCount(), 0)
  const b = (
    await service.act(ctx(), {
      kind: 'connect',
      form: { ...form, email: 'b@example.test', mode: 'from_connection' },
    })
  ).active!
  await until(() => service.snapshot().folders[0].phase === 'incremental' && !service.snapshot().running)
  await assert.rejects(service.conversations(ctx(), a), /账号已改变/)
  await assert.rejects(service.act(ctx(), rename), /账号已改变/)
  await assert.rejects(service.act(ctx(), { ...rename, account: b }), /没有这个联系人/)
  await assert.rejects(service.timeline(stale, a, 'alice'), /工作区已改变/)
  assert.notEqual(a, b)
  assert.deepEqual(await service.temporaryDrafts(ctx(),b),[])
  assert.equal((await service.composer(ctx(),b,destination,{kind:'get'})).draft.text_body,'')
  assert.equal(await service.unreadCount(), 0)
  assert.equal(service.snapshot().imported, 0)
  await service.act(ctx(), { kind: 'disconnect' })
  const calls = currentMail
  assert.equal((await service.act(ctx(), { kind: 'connect', form })).active, a)
  await until(() => service.snapshot().imported === 3 && !service.snapshot().running)
  assert.deepEqual(await service.temporaryDrafts(ctx(),a),[destination])
  assert.equal((await service.composer(ctx(),a,destination,{kind:'get'})).draft.text_body,'仅保存在账号 A')
  assert.equal(currentMail, calls)
  assert.equal(await service.unreadCount(), 1)
  const contacts = await service.conversations(ctx(), a)
  const alice = contacts.find((c) => c.email === 'alice@example.test')!
  assert.deepEqual([alice.id, alice.name, alice.remark, alice.pinned], [contact.id, contact.name, '老客户 Alice', true])
  await service.act(ctx(), { ...rename, remark: '   ' })
  const cleared = (await service.conversations(ctx(), a)).find(c => c.id === contact.id)!
  assert.deepEqual([cleared.name, cleared.remark, cleared.pinned], [contact.name, undefined, true])
  assert.equal((await service.timeline(ctx(), a, alice.id)).messages.length, 2)
  await service.act(ctx(), { kind: 'delete', id: b })
  assert.equal(service.snapshot().accounts.length, 1)
})

test('a verification completing after a workspace switch cannot activate or persist credentials', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-mail-switch-'))
  let root = path.join(dir, 'first')
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { imapClient } = await import('./protocol')
  const service = new MailboxService(
    () => root,
    {
      dir: path.join(dir, 'credentials'),
      encrypt: () => {
        throw new Error('过期请求不应保存凭据')
      },
      decrypt: () => {
        throw new Error('没有凭据')
      },
    },
    () => {},
    { verify: () => pending, imapClient, importFolder },
  )
  t.after(() => {
    service.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const endpoint = { host: 'example.test', port: 993, username: 'a', security: 'tls' as const }
  const action = {
    kind: 'connect' as const,
    form: {
      email: 'a@example.test',
      password: 'fixture',
      mode: 'from_connection' as const,
      imap: endpoint,
      smtp: { ...endpoint, port: 465 },
    },
  }
  const ctx = service.snapshot().context
  const connecting = service.act(ctx, action)
  await assert.rejects(service.act(ctx, action), /正在验证/)
  root = path.join(dir, 'second')
  service.start()
  finish()
  await assert.rejects(connecting, /工作区已改变/)
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('启动积压静默，新增来信分联系人合并通知，关闭开关后仍更新未读', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-arrivals-'))
  const endpoint = { host: 'mail.test', port: 993, username: 'a', security: 'tls' as const }
  let upper = 1,
    cycles = 0
  const client = {
    connect: async () => {},
    close: () => {},
    mailboxOpen: async () => ({ uidNext: upper + 1, uidValidity: 1n }),
    list: async () => [],
    search: async ({ uid }: { uid: string }) => {
      const [start, end] = uid.split(':').map(Number)
      return Array.from({ length: end - start + 1 }, (_, i) => i + start)
    },
    fetchOne: async (uid: string) => ({
      internalDate: new Date(),
      flags: new Set(),
      source: Buffer.from(
        [
          'From: Alice <alice@mail.test>',
          'To: a@mail.test',
          'Message-ID: <' + uid + '@mail.test>',
          'Subject: ' + uid,
          '',
          'body',
        ].join('\r\n'),
      ),
    }),
    fetchAll: async (ids: number[]) => {
      cycles++
      return ids.map((uid) => ({ uid, flags: new Set() }))
    },
  } as unknown as ImapFlow
  const notices: { contact: string; count: number; message: string; sender: string }[] = []
  const service = new MailboxService(
    () => root,
    { dir: root, encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() },
    () => {},
    { verify: async () => {}, imapClient: () => client, importFolder },
    { clear: () => {}, show: (target, sender, count) => notices.push({ ...target, sender, count }) },
  )
  t.after(() => {
    service.stop()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const ctx = () => service.snapshot().context
  const id = (
    await service.act(ctx(), {
      kind: 'connect',
      form: { email: 'a@mail.test', password: 'x', mode: 'last_30_days', imap: endpoint, smtp: endpoint },
    })
  ).active!
  async function synced(after: number) {
    for (let i = 0; i < 200; i++) {
      if (cycles > after && !service.snapshot().running) return
      await wait(10)
    }
    assert.fail('同步超时')
  }
  await synced(0)
  assert.equal(notices.length, 0)
  const [contact] = await service.conversations(ctx(), id)
  await service.act(ctx(), { kind: 'remark', account: id, contact: contact.id, remark: '采购 Alice' })
  let prev = cycles
  upper = 3
  await service.act(ctx(), { kind: 'retry' })
  await synced(prev)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].count, 2)
  assert.equal(notices[0].sender, '采购 Alice')
  const rows = await service.timeline(ctx(), id, notices[0].contact)
  assert.equal(rows.messages.find((m) => m.id === notices[0].message)?.subject, '3')
  await service.act(ctx(), { kind: 'notifications', account: id, enabled: false })
  prev = cycles
  upper = 4
  await service.act(ctx(), { kind: 'retry' })
  await synced(prev)
  assert.equal(await service.unreadCount(), 4)
  assert.equal(notices.length, 1)
  prev = cycles
  service.start()
  await synced(prev)
  assert.equal(service.snapshot().accounts[0].notifications, false)
  assert.equal(notices.length, 1)
})
