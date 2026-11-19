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
        flags: new Set(['\\Seen']),
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
  assert.deepEqual(service.snapshot().candidates, ['Outgoing'])
  failFetch = false
  await service.act(ctx(), { kind: 'retry' })
  await until(() => service.snapshot().imported === 2 && !service.snapshot().running)
  await service.act(ctx(), { kind: 'bind', path: 'Outgoing' })
  await until(() => service.snapshot().imported === 3 && !service.snapshot().running)
  assert.deepEqual(service.snapshot().contacts.sort(), ['alice@example.test', 'bob@example.test'])
  await assert.rejects(service.act(stale, { kind: 'disconnect' }), /改变/)
  await service.act(ctx(), { kind: 'disconnect' })
  const b = (
    await service.act(ctx(), {
      kind: 'connect',
      form: { ...form, email: 'b@example.test', mode: 'from_connection' },
    })
  ).active!
  await until(() => service.snapshot().folders[0].phase === 'incremental' && !service.snapshot().running)
  assert.notEqual(a, b)
  assert.equal(service.snapshot().imported, 0)
  await service.act(ctx(), { kind: 'disconnect' })
  const calls = currentMail
  assert.equal((await service.act(ctx(), { kind: 'connect', form })).active, a)
  await until(() => service.snapshot().imported === 3 && !service.snapshot().running)
  assert.equal(currentMail, calls)
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
