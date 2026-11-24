import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ImapFlow } from 'imapflow'
import { connectImap, diagnostic, netEaseImap, verifySmtp } from './protocol'

test('manual SMTP verification reports the failing endpoint without exposing server text', async () => {
  const smtp = { host: 'mail.example.com', username: 'a', port: 465, security: 'tls' as const }
  let probes = 0
  await assert.rejects(verifySmtp(smtp, 'app-password', async endpoint => {
    probes++
    assert.deepEqual(endpoint, smtp)
    throw Object.assign(new Error('sensitive server text'), { code: 'ESOCKET', originalCode: 'ECONNRESET' })
  }), (err: Error) => {
    assert.match(err.message, /465 TLS.*提前关闭.*ECONNRESET/)
    assert.doesNotMatch(err.message, /sensitive|app-password/)
    return true
  })
  assert.equal(probes, 1)
})

test('NetEase IMAP identifies the client again after login', async () => {
  assert.equal(netEaseImap('imap.163.com'), true)
  assert.equal(netEaseImap('imap.126.com'), true)
  assert.equal(netEaseImap('IMAP.YEAH.NET.'), true)
  assert.equal(netEaseImap('imap.qq.com'), false)
  const calls: unknown[] = []
  const client = {
    capabilities: new Map<string, boolean>(),
    clientInfo: { name: 'FTCS', 'support-email': 'mfs1998@qq.com' },
    connect: async () => {
      calls.push('connect')
    },
    run: async (command: string, info: unknown) => {
      calls.push([command, info])
    },
  }
  await connectImap(client as unknown as ImapFlow, 'imap.163.com')
  assert.equal(client.capabilities.get('ID'), true)
  assert.deepEqual(calls, ['connect', ['ID', client.clientInfo]])
  calls.length = 0
  await connectImap(client as unknown as ImapFlow, 'imap.gmail.com')
  assert.deepEqual(calls, ['connect'])
  assert.equal(diagnostic(new Error('邮件服务器未返回文件夹范围。')), '邮件服务器未返回文件夹范围。')
})
